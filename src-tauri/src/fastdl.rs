//! The desktop app's update download (v0.9.4).
//!
//! Tauri's updater fetches the file over one connection and waits it out, however slow that connection is.
//! Fresh connections to GitHub's download servers vary from ~25 KB/s to ~50 MB/s on the same line (measured
//! from Bali on 2026-11-08: the 93 MB AppImage crawled for 25+ minutes in the app while curl fetched it in
//! 2 s), so here the file comes in pieces over several connections, spread across the download host's
//! addresses. A connection that stalls or crawls is dropped, the bytes it got are kept, and the rest of its
//! piece goes back in the queue for a fresh connection. The finished bytes go to the updater's own
//! `install`, which checks the signature first, exactly as after its own download.
//!
//! Anything that keeps this from working (a server without range requests, no network) comes back as an
//! error starting "fast download:", and the game falls back to the updater's own download.

use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_RANGE, RANGE};
use reqwest::{Client, StatusCode, Url};
use serde::Serialize;
use tauri::{ipc::Channel, Manager, ResourceId, Runtime, Webview};
use tauri_plugin_updater::Update;

const USER_AGENT: &str = concat!("kardashev-project/", env!("CARGO_PKG_VERSION"), " (updater)");

/// How the download behaves. `Default` is what the game uses; the tests shrink the numbers.
#[derive(Clone, Debug)]
pub struct Tuning {
    /// Bytes per piece.
    pub piece: u64,
    /// Connections at once.
    pub connections: usize,
    /// No bytes for this long (counting the wait for the reply): drop the connection.
    pub stall: Duration,
    /// A connection's speed is judged once it has been on a piece this long...
    pub judge_after: Duration,
    /// ...and it is dropped below this many bytes a second...
    pub floor: f64,
    /// ...or below the best recent speed divided by this.
    pub ratio: f64,
    /// No bytes on any connection for this long: give up (the network is gone).
    pub give_up: Duration,
    /// Tests: use these addresses for the download host instead of asking DNS.
    pub addrs: Option<Vec<SocketAddr>>,
}

impl Default for Tuning {
    fn default() -> Self {
        Tuning {
            piece: 2 << 20,
            connections: 6,
            stall: Duration::from_secs(8),
            judge_after: Duration::from_secs(4),
            floor: 64_000.0,
            ratio: 8.0,
            give_up: Duration::from_secs(60),
            addrs: None,
        }
    }
}

/// What happened along the way (logged, and checked by the tests).
#[derive(Debug, Default, Clone)]
pub struct Stats {
    pub total: u64,
    pub pieces: usize,
    /// Connections dropped for being slow, stalled or broken.
    pub drops: usize,
    /// Times the download link had expired and was fetched again.
    pub refreshes: usize,
    pub addrs: Vec<SocketAddr>,
    pub secs: f64,
}

struct Piece {
    start: u64,
    end: u64,
    data: Vec<u8>,
}

impl Piece {
    fn next(&self) -> u64 {
        self.start + self.data.len() as u64
    }
    fn done(&self) -> bool {
        self.next() >= self.end
    }
}

/// Why a connection was let go of.
enum Cut {
    Slow,
    Stalled,
    Broken,
    Expired,
    Fatal(String),
}

struct Shared {
    origin: Url,
    headers: HeaderMap,
    host: String,
    /// The download host's URL (GitHub signs it for 30 minutes): fetched again when it stops working.
    target: Mutex<Url>,
    refresh_lock: tokio::sync::Mutex<()>,
    probe_client: Client,
    queue: Mutex<VecDeque<Piece>>,
    done: Mutex<Vec<Piece>>,
    left: AtomicUsize,
    got: AtomicU64,
    /// The best recent speed of a finished piece, bytes a second (fades so one lucky piece doesn't set it forever).
    best: Mutex<f64>,
    last_byte: Mutex<Instant>,
    failed: Mutex<Option<String>>,
    drops: AtomicUsize,
    refreshes: AtomicUsize,
}

impl Shared {
    fn fail(&self, why: String) {
        self.failed.lock().unwrap().get_or_insert(why);
    }
    fn stopped(&self) -> bool {
        self.left.load(Ordering::SeqCst) == 0 || self.failed.lock().unwrap().is_some()
    }
}

fn client(host: &str, addrs: &[SocketAddr], t: &Tuning) -> Result<Client, String> {
    let mut b = Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(t.stall)
        .pool_max_idle_per_host(1);
    if !addrs.is_empty() {
        b = b.resolve_to_addrs(host, addrs);
    }
    b.build().map_err(|e| e.to_string())
}

/// Ask for the first byte: the size, the URL after redirects, and the address that answered.
async fn probe(sh_client: &Client, origin: &Url, headers: &HeaderMap, t: &Tuning) -> Result<(Url, u64, Option<SocketAddr>), String> {
    let send = sh_client.get(origin.clone()).headers(headers.clone()).header(RANGE, "bytes=0-0").send();
    let resp = tokio::time::timeout(t.stall * 3, send)
        .await
        .map_err(|_| "no answer from the server".to_string())?
        .map_err(|e| format!("can't reach the server: {e}"))?;
    if resp.status() != StatusCode::PARTIAL_CONTENT {
        return Err(format!("the server doesn't do range requests (HTTP {})", resp.status()));
    }
    let total = resp
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next())
        .and_then(|n| n.trim().parse::<u64>().ok())
        .ok_or("the server didn't say how big the file is")?;
    Ok((resp.url().clone(), total, resp.remote_addr()))
}

/// Fetch the link again after the download host refused it (expired). One worker does it; the rest wait and reuse it.
async fn refresh(sh: &Shared, used: &Url, t: &Tuning) -> Result<(), String> {
    let _guard = sh.refresh_lock.lock().await;
    if *sh.target.lock().unwrap() != *used {
        return Ok(()); // someone else already did
    }
    if sh.refreshes.fetch_add(1, Ordering::SeqCst) >= 20 {
        return Err("the download link keeps expiring".into());
    }
    let (url, _, _) = probe(&sh.probe_client, &sh.origin, &sh.headers, t).await?;
    *sh.target.lock().unwrap() = url;
    Ok(())
}

async fn fetch_piece(client: &Client, url: &Url, piece: &mut Piece, sh: &Shared, t: &Tuning) -> Result<(), Cut> {
    let from = piece.next();
    let send = client
        .get(url.clone())
        .headers(sh.headers.clone())
        .header(RANGE, format!("bytes={}-{}", from, piece.end - 1))
        .send();
    let resp = match tokio::time::timeout(t.stall, send).await {
        Err(_) => return Err(Cut::Stalled),
        Ok(Err(_)) => return Err(Cut::Broken),
        Ok(Ok(r)) => r,
    };
    match resp.status() {
        StatusCode::PARTIAL_CONTENT => {}
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND | StatusCode::GONE => return Err(Cut::Expired),
        s if s.is_server_error() || s == StatusCode::TOO_MANY_REQUESTS => return Err(Cut::Broken),
        s => return Err(Cut::Fatal(format!("HTTP {s} for a piece of the file"))),
    }
    let starts_right = resp
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with(&format!("bytes {from}-")));
    if !starts_right {
        return Err(Cut::Fatal("the server sent the wrong part of the file".into()));
    }
    let t0 = Instant::now();
    let mut got = 0u64;
    let mut stream = resp.bytes_stream();
    loop {
        let next = match tokio::time::timeout(t.stall, stream.next()).await {
            Err(_) => return Err(Cut::Stalled),
            Ok(n) => n,
        };
        match next {
            None => break,
            Some(Err(_)) => return Err(Cut::Broken),
            Some(Ok(chunk)) => {
                let take = chunk.len().min((piece.end - piece.next()) as usize);
                piece.data.extend_from_slice(&chunk[..take]);
                got += take as u64;
                sh.got.fetch_add(take as u64, Ordering::SeqCst);
                *sh.last_byte.lock().unwrap() = Instant::now();
                if piece.done() {
                    break;
                }
                let secs = t0.elapsed().as_secs_f64();
                if secs >= t.judge_after.as_secs_f64() {
                    let best = *sh.best.lock().unwrap();
                    if (got as f64) / secs < t.floor.max(best / t.ratio) {
                        return Err(Cut::Slow);
                    }
                }
            }
        }
    }
    if !piece.done() {
        return Err(Cut::Broken); // the connection ended early
    }
    let rate = got as f64 / t0.elapsed().as_secs_f64().max(0.001);
    let mut best = sh.best.lock().unwrap();
    *best = rate.max(*best * 0.8);
    Ok(())
}

async fn worker(sh: Arc<Shared>, t: Arc<Tuning>, addrs: Arc<Vec<SocketAddr>>, mut slot: usize) {
    let mut conn: Option<Client> = None;
    loop {
        if sh.stopped() {
            return;
        }
        if sh.last_byte.lock().unwrap().elapsed() > t.give_up {
            sh.fail(format!("no data for {} s", t.give_up.as_secs()));
            return;
        }
        let Some(mut piece) = sh.queue.lock().unwrap().pop_front() else {
            tokio::time::sleep(Duration::from_millis(40)).await;
            continue;
        };
        if conn.is_none() {
            let pin: Vec<SocketAddr> = if addrs.is_empty() { vec![] } else { vec![addrs[slot % addrs.len()]] };
            match client(&sh.host, &pin, &t) {
                Ok(c) => conn = Some(c),
                Err(e) => {
                    sh.queue.lock().unwrap().push_front(piece);
                    sh.fail(e);
                    return;
                }
            }
        }
        let url = sh.target.lock().unwrap().clone();
        let result = fetch_piece(conn.as_ref().unwrap(), &url, &mut piece, &sh, &t).await;
        match result {
            Ok(()) => {
                sh.done.lock().unwrap().push(piece);
                sh.left.fetch_sub(1, Ordering::SeqCst);
            }
            Err(why) => {
                // the oldest unfinished work goes first, on a fresh connection to the next address
                sh.queue.lock().unwrap().push_front(piece);
                conn = None;
                slot += 1;
                match why {
                    Cut::Slow | Cut::Stalled => {
                        sh.drops.fetch_add(1, Ordering::SeqCst);
                    }
                    Cut::Broken => {
                        sh.drops.fetch_add(1, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis(250)).await;
                    }
                    Cut::Expired => {
                        if let Err(e) = refresh(&sh, &url, &t).await {
                            sh.fail(e);
                            return;
                        }
                    }
                    Cut::Fatal(e) => {
                        sh.fail(e);
                        return;
                    }
                }
            }
        }
    }
}

/// The download host's addresses, in the family that answered the probe (no point trying IPv6 on an IPv4 line).
async fn addresses(url: &Url, answered: Option<SocketAddr>) -> Vec<SocketAddr> {
    let (Some(host), Some(port)) = (url.host_str(), url.port_or_known_default()) else { return vec![] };
    let Ok(found) = tokio::net::lookup_host((host, port)).await else { return vec![] };
    let mut out: Vec<SocketAddr> = vec![];
    for a in found {
        let same_family = answered.is_none_or(|b| a.is_ipv4() == b.is_ipv4());
        if same_family && !out.contains(&a) {
            out.push(a);
        }
    }
    out
}

/// Download `url` in pieces. `progress(got, total)` is called a few times a second.
pub async fn fetch(url: Url, mut headers: HeaderMap, t: Tuning, progress: impl Fn(u64, u64)) -> Result<(Vec<u8>, Stats), String> {
    let started = Instant::now();
    // TLS's crypto (the updater's check() installs the same one; this makes sure, whatever runs first)
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    if !headers.contains_key(ACCEPT) {
        headers.insert(ACCEPT, HeaderValue::from_static("application/octet-stream"));
    }
    let origin_host = url.host_str().unwrap_or_default().to_string();
    let probe_client = client(&origin_host, t.addrs.as_deref().unwrap_or(&[]), &t)?;
    let (target, total, answered) = probe(&probe_client, &url, &headers, &t).await?;
    let host = target.host_str().unwrap_or_default().to_string();
    let addrs = match &t.addrs {
        Some(a) => a.clone(),
        None => addresses(&target, answered).await,
    };

    let mut queue = VecDeque::new();
    let mut start = 0;
    while start < total {
        let end = (start + t.piece).min(total);
        queue.push_back(Piece { start, end, data: Vec::with_capacity((end - start) as usize) });
        start = end;
    }
    let pieces = queue.len();
    let sh = Arc::new(Shared {
        origin: url,
        headers,
        host,
        target: Mutex::new(target),
        refresh_lock: tokio::sync::Mutex::new(()),
        probe_client,
        queue: Mutex::new(queue),
        done: Mutex::new(Vec::with_capacity(pieces)),
        left: AtomicUsize::new(pieces),
        got: AtomicU64::new(0),
        best: Mutex::new(0.0),
        last_byte: Mutex::new(Instant::now()),
        failed: Mutex::new(None),
        drops: AtomicUsize::new(0),
        refreshes: AtomicUsize::new(0),
    });
    let t = Arc::new(t);
    let shared_addrs = Arc::new(addrs.clone());
    let workers: Vec<_> = (0..t.connections.max(1).min(pieces.max(1)))
        .map(|slot| tokio::spawn(worker(sh.clone(), t.clone(), shared_addrs.clone(), slot)))
        .collect();
    while !sh.stopped() {
        progress(sh.got.load(Ordering::SeqCst), total);
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    for w in &workers {
        w.abort();
    }
    progress(sh.got.load(Ordering::SeqCst), total);
    if let Some(why) = sh.failed.lock().unwrap().take() {
        return Err(why);
    }

    let mut done = std::mem::take(&mut *sh.done.lock().unwrap());
    done.sort_by_key(|p| p.start);
    let mut bytes = Vec::with_capacity(total as usize);
    for p in done {
        if p.start != bytes.len() as u64 {
            return Err("a piece of the file went missing".into());
        }
        bytes.extend_from_slice(&p.data);
    }
    if bytes.len() as u64 != total {
        return Err(format!("got {} of {} bytes", bytes.len(), total));
    }
    let stats = Stats {
        total,
        pieces,
        drops: sh.drops.load(Ordering::SeqCst),
        refreshes: sh.refreshes.load(Ordering::SeqCst),
        addrs,
        secs: started.elapsed().as_secs_f64(),
    };
    Ok((bytes, stats))
}

/// What the game hears while it updates.
#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum UpdateEvent {
    Progress { got: u64, total: u64 },
    Installing,
}

/// Download the update the game found (`rid` = its Update from the updater's `check`) and install it.
/// The game restarts itself afterwards. Errors from the download start with "fast download:".
#[tauri::command]
pub async fn update_fast<R: Runtime>(webview: Webview<R>, rid: ResourceId, on_event: Channel<UpdateEvent>) -> Result<(), String> {
    let update = webview.resources_table().get::<Update>(rid).map_err(|e| format!("fast download: {e}"))?;
    let update = (*update).clone();
    let events = on_event.clone();
    let (bytes, stats) = fetch(update.download_url.clone(), update.headers.clone(), Tuning::default(), move |got, total| {
        let _ = events.send(UpdateEvent::Progress { got, total });
    })
    .await
    .map_err(|e| format!("fast download: {e}"))?;
    eprintln!(
        "update {}: {} bytes in {:.1} s, {} pieces, {} connections dropped, {} link refreshes, addresses {:?}",
        update.version, stats.total, stats.secs, stats.pieces, stats.drops, stats.refreshes, stats.addrs
    );
    let _ = on_event.send(UpdateEvent::Installing);
    // install() checks the signature before it touches anything
    update.install(&bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests;
