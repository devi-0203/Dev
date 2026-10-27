package com.pocketwise;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/** Serves the website (HTML, CSS, JS) from the web/ folder. */
public final class StaticHandler implements HttpHandler {

    private static final Map<String, String> TYPES = Map.ofEntries(
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("json", "application/json; charset=utf-8"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("png", "image/png"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("woff2", "font/woff2"),
            Map.entry("txt", "text/plain; charset=utf-8"));

    private final Path root;

    public StaticHandler(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod();
            if (!method.equals("GET") && !method.equals("HEAD")) {
                respond(ex, 405, "text/plain; charset=utf-8", "Method not allowed".getBytes(StandardCharsets.UTF_8), true);
                return;
            }
            String requested = ex.getRequestURI().getPath();
            if (requested.equals("/")) requested = "/index.html";

            Path file = root.resolve(requested.substring(1)).normalize();
            if (!file.startsWith(root)) {                       // blocks ../ tricks
                respond(ex, 403, "text/plain; charset=utf-8", "Forbidden".getBytes(StandardCharsets.UTF_8), true);
                return;
            }
            if (!Files.isRegularFile(file)) {
                respond(ex, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8), method.equals("GET"));
                return;
            }
            String name = file.getFileName().toString();
            String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
            ex.getResponseHeaders().set("Cache-Control", "no-cache");
            respond(ex, 200, TYPES.getOrDefault(ext, "application/octet-stream"), Files.readAllBytes(file), method.equals("GET"));
        } finally {
            ex.close();
        }
    }

    private static void respond(HttpExchange ex, int status, String type, byte[] bytes, boolean withBody) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        if (!withBody) {
            ex.sendResponseHeaders(status, -1);
            return;
        }
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}
