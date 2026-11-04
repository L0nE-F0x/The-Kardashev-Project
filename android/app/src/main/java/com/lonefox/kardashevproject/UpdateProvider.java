package com.lonefox.kardashevproject;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands the downloaded update to the phone's installer: one read-only file, content://<app>.update/update.apk
 * (a tiny stand-in for androidx's FileProvider, so the app needs no libraries).
 */
public class UpdateProvider extends ContentProvider {
    static final String APK_TYPE = "application/vnd.android.package-archive";
    private static final String NAME = "update.apk";

    static File file(Context c) {
        return new File(new File(c.getCacheDir(), "update"), NAME);
    }

    static Uri uri(Context c) {
        return Uri.parse("content://" + c.getPackageName() + ".update/" + NAME);
    }

    private File checked(Uri uri) throws FileNotFoundException {
        File f = file(getContext());
        if (!NAME.equals(uri.getLastPathSegment()) || !f.exists()) throw new FileNotFoundException(uri.toString());
        return f;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return APK_TYPE;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(checked(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        // installers ask for the name and size
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        File f = file(getContext());
        if (NAME.equals(uri.getLastPathSegment()) && f.exists()) c.addRow(new Object[] { "Kardashev update.apk", f.length() });
        return c;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }
}
