//! The piecewise download against small fake servers on loopback addresses (127.0.0.1, .2, .3… on one port),
//! each behaving badly in its own way; `github_release` (ignored: it needs the network) fetches the real
//! latest release and checks its signature.
//!   cargo test --manifest-path src-tauri/Cargo.toml fastdl
//!   cargo test --manifest-path src-tauri/Cargo.toml fastdl -- --ignored --nocapture

use super::*;
use std::collections::HashMap;
use std::net::Ipv4Addr;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Mode {
    /// Everything at once.
    Fast,
    /// 2 KB every 50 ms (~40 KB/s).
    Slow,
    /// Hangs up after 100 KB of each reply.
    Flaky,
    /// Sends the reply's first 1 KB, then nothing.
    Stall,
    /// Answers the first-byte probe, then never replies to anything.
    Hang,
    /// Ignores Range and sends the whole file with 200.
    NoRanges,
}

struct Srv {
    data: Vec<u8>,
    link: AtomicUsize,
    /// Requests served per link generation; a link stops working after `expire` of them (0 = never).
    uses: Mutex<HashMap<usize, usize>>,
    expire: usize,
}

fn file(n: usize) -> Vec<u8> {
    (0..n).map(|i| ((i * 7 + i / 251) % 256) as u8).collect()
}

/// One server per mode, on 127.0.0.1, 127.0.0.2… all with the same port (reqwest's address pinning keeps the URL's port).
async fn serve(modes: &[Mode], srv: Arc<Srv>) -> (u16, Vec<SocketAddr>) {
    let first = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let port = first.local_addr().unwrap().port();
    let mut listeners = vec![first];
    for i in 1..modes.len() {
        listeners.push(TcpListener::bind((Ipv4Addr::new(127, 0, 0, 1 + i as u8), port)).await.unwrap());
    }
    let mut addrs = vec![];
    for (l, &mode) in listeners.into_iter().zip(modes) {
        addrs.push(l.local_addr().unwrap());
        let srv = srv.clone();
        tokio::spawn(async move {
            while let Ok((sock, _)) = l.accept().await {
                tokio::spawn(conn(sock, mode, srv.clone()));
            }
        });
    }
    (port, addrs)
}

async fn conn(sock: TcpStream, mode: Mode, srv: Arc<Srv>) {
    let (r, mut w) = sock.into_split();
    let mut r = BufReader::new(r);
    loop {
        let mut line = String::new();
        if r.read_line(&mut line).await.unwrap_or(0) == 0 {
            return;
        }
        let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
        let mut range: Option<(usize, usize)> = None;
        loop {
            let mut h = String::new();
            if r.read_line(&mut h).await.unwrap_or(0) == 0 {
                return;
            }
            let h = h.trim_end();
            if h.is_empty() {
                break;
            }
            if let Some((k, v)) = h.split_once(':')
                && k.eq_ignore_ascii_case("range")
            {
                let (a, b) = v.trim().trim_start_matches("bytes=").split_once('-').unwrap();
                range = Some((a.parse().unwrap(), b.parse().unwrap()));
            }
        }
        let total = srv.data.len();
        if path.starts_with("/start") {
            let g = srv.link.fetch_add(1, Ordering::SeqCst) + 1;
            let reply = format!("HTTP/1.1 302 Found\r\nLocation: /file?t={g}\r\nContent-Length: 0\r\n\r\n");
            if w.write_all(reply.as_bytes()).await.is_err() {
                return;
            }
            continue;
        }
        if srv.expire > 0 {
            let g: usize = path.rsplit('=').next().unwrap().parse().unwrap();
            let expired = {
                let mut uses = srv.uses.lock().unwrap();
                let n = uses.entry(g).or_insert(0);
                *n += 1;
                *n > srv.expire
            };
            if expired {
                if w.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n").await.is_err() {
                    return;
                }
                continue;
            }
        }
        if mode == Mode::NoRanges {
            let head = format!("HTTP/1.1 200 OK\r\nContent-Length: {total}\r\n\r\n");
            let _ = w.write_all(head.as_bytes()).await;
            let _ = w.write_all(&srv.data).await;
            continue;
        }
        let (a, b) = range.unwrap_or((0, total - 1));
        if mode == Mode::Hang && (a, b) != (0, 0) {
            tokio::time::sleep(Duration::from_secs(3600)).await;
            return;
        }
        let body = &srv.data[a..=b];
        let head = format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {a}-{b}/{total}\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );
        if w.write_all(head.as_bytes()).await.is_err() {
            return;
        }
        let ok = match mode {
            Mode::Slow => {
                for chunk in body.chunks(2048) {
                    if w.write_all(chunk).await.is_err() {
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                true
            }
            Mode::Flaky => {
                let _ = w.write_all(&body[..body.len().min(100_000)]).await;
                body.len() <= 100_000
            }
            Mode::Stall => {
                let _ = w.write_all(&body[..body.len().min(1024)]).await;
                if body.len() > 1024 {
                    tokio::time::sleep(Duration::from_secs(3600)).await;
                }
                body.len() <= 1024
            }
            _ => w.write_all(body).await.is_ok(),
        };
        if !ok {
            return; // hang up
        }
    }
}

fn tuning(addrs: Vec<SocketAddr>) -> Tuning {
    Tuning {
        piece: 256 << 10,
        connections: 4,
        stall: Duration::from_millis(800),
        judge_after: Duration::from_millis(400),
        floor: 200_000.0,
        ratio: 8.0,
        give_up: Duration::from_secs(3),
        addrs: Some(addrs),
    }
}

async fn run(modes: &[Mode], size: usize, expire: usize, tweak: impl FnOnce(&mut Tuning)) -> (Vec<u8>, Result<(Vec<u8>, Stats), String>, f64) {
    let srv = Arc::new(Srv { data: file(size), link: AtomicUsize::new(0), uses: Mutex::new(HashMap::new()), expire });
    let (port, addrs) = serve(modes, srv.clone()).await;
    let mut t = tuning(addrs);
    tweak(&mut t);
    let url: Url = format!("http://kp.test:{port}/start").parse().unwrap();
    let t0 = Instant::now();
    let last = Arc::new(AtomicU64::new(0));
    let seen = last.clone();
    let out = fetch(url, HeaderMap::new(), t, move |got, _| seen.store(got, Ordering::SeqCst)).await;
    if let Ok((bytes, _)) = &out {
        assert_eq!(last.load(Ordering::SeqCst), bytes.len() as u64, "the last progress report is the whole file");
    }
    (srv.data.clone(), out, t0.elapsed().as_secs_f64())
}

#[tokio::test(flavor = "multi_thread")]
async fn a_good_server_gives_the_exact_file() {
    let (want, out, _) = run(&[Mode::Fast], 3_000_000, 0, |_| {}).await;
    let (got, stats) = out.unwrap();
    assert!(got == want);
    assert_eq!(stats.pieces, 12);
    assert_eq!(stats.drops, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn slow_and_stalled_connections_are_dropped_for_fresh_ones() {
    // on the slow server alone each 256 KB piece takes 6.4 s; the stalled one never finishes one
    let (want, out, secs) = run(&[Mode::Fast, Mode::Slow, Mode::Stall], 4_000_000, 0, |_| {}).await;
    let (got, stats) = out.unwrap();
    assert!(got == want);
    assert!(stats.drops >= 2, "{stats:?}");
    assert!(secs < 6.0, "took {secs:.1} s");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_connection_that_hangs_up_keeps_what_it_got() {
    let (want, out, _) = run(&[Mode::Flaky], 1_000_000, 0, |_| {}).await;
    let (got, stats) = out.unwrap();
    assert!(got == want);
    assert!(stats.drops >= 4, "{stats:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_expired_link_is_fetched_again() {
    let (want, out, _) = run(&[Mode::Fast], 3_000_000, 3, |_| {}).await;
    let (got, stats) = out.unwrap();
    assert!(got == want);
    assert!(stats.refreshes >= 2, "{stats:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_server_without_ranges_is_refused() {
    let (_, out, _) = run(&[Mode::NoRanges], 1_000_000, 0, |_| {}).await;
    let err = out.unwrap_err();
    assert!(err.contains("range"), "{err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn it_gives_up_when_nothing_arrives() {
    let (_, out, secs) = run(&[Mode::Hang], 1_000_000, 0, |t| t.give_up = Duration::from_secs(2)).await;
    let err = out.unwrap_err();
    assert!(err.contains("no data"), "{err}");
    assert!(secs < 5.0, "took {secs:.1} s");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_slow_line_still_finishes() {
    // every server crawls: nothing to switch to, but each try keeps its bytes, so it gets there
    let (want, out, _) = run(&[Mode::Slow, Mode::Slow], 300_000, 0, |t| t.piece = 64 << 10).await;
    let (got, _) = out.unwrap();
    assert!(got == want);
}

/// The real thing: the latest release from GitHub, checked against its signature with the app's public key.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn github_release() {
    use base64::Engine;
    let _ = rustls::crypto::ring::default_provider().install_default();
    let b64 = |s: &str| String::from_utf8(base64::engine::general_purpose::STANDARD.decode(s.trim()).unwrap()).unwrap();
    let conf: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json")).unwrap()).unwrap();
    let endpoint = conf["plugins"]["updater"]["endpoints"][0].as_str().unwrap();
    let pubkey = minisign_verify::PublicKey::decode(&b64(conf["plugins"]["updater"]["pubkey"].as_str().unwrap())).unwrap();
    let latest: serde_json::Value = serde_json::from_str(&reqwest::get(endpoint).await.unwrap().text().await.unwrap()).unwrap();
    let platform = &latest["platforms"][std::env::var("KP_PLATFORM").unwrap_or("linux-x86_64".into())];
    let url: Url = platform["url"].as_str().unwrap().parse().unwrap();
    let sig = minisign_verify::Signature::decode(&b64(platform["signature"].as_str().unwrap())).unwrap();

    let (bytes, stats) = fetch(url.clone(), HeaderMap::new(), Tuning::default(), |_, _| {}).await.unwrap();
    pubkey.verify(&bytes, &sig, true).expect("the signature matches");
    eprintln!(
        "{} {}: {:.1} MB in {:.1} s ({:.1} MB/s), {} pieces, {} dropped, {} refreshes, {:?}",
        latest["version"],
        url.path().rsplit('/').next().unwrap(),
        stats.total as f64 / 1e6,
        stats.secs,
        stats.total as f64 / 1e6 / stats.secs,
        stats.pieces,
        stats.drops,
        stats.refreshes,
        stats.addrs
    );
}
