package com.pocketwise;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Executors;

/**
 * Starts Pocketwise using only the JDK: no frameworks, no libraries.
 *
 * Optional settings (environment variables): PORT (default 8080), HOST (default 127.0.0.1;
 * use 0.0.0.0 to open the app to other devices on your network), WEB_DIR, DATA_FILE.
 */
public final class Main {
    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(env("PORT", "8080"));
        String host = env("HOST", "127.0.0.1");
        Path webDir = Paths.get(env("WEB_DIR", "web"));
        Path dataFile = Paths.get(env("DATA_FILE", "data/pocketwise.json"));

        if (!Files.isRegularFile(webDir.resolve("index.html"))) {
            System.err.println("Can't find " + webDir.toAbsolutePath().resolve("index.html")
                    + ". Run the app from the project folder (the one that contains web/).");
            System.exit(1);
        }

        BudgetService service = new BudgetService(new Store(dataFile));

        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.createContext("/api", new ApiHandler(service));
        server.createContext("/", new StaticHandler(webDir));
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println("Pocketwise is running at http://" + (host.equals("0.0.0.0") ? "localhost" : host) + ":" + port);
        System.out.println("Your data is saved in " + dataFile.toAbsolutePath());
        System.out.println("Press Ctrl+C to stop.");
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
