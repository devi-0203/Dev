package com.pocketwise;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;

/** Routes /api/... requests to {@link BudgetService} and writes JSON back. */
public final class ApiHandler implements HttpHandler {

    private static final int MAX_BODY_BYTES = 64 * 1024;
    private final BudgetService service;

    public ApiHandler(BudgetService service) {
        this.service = service;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            // Lets the Android app (loaded from its own origin) call a hosted copy of this server.
            ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

            String method = ex.getRequestMethod();
            if (method.equals("OPTIONS")) {
                ex.sendResponseHeaders(204, -1);
                return;
            }

            String[] seg = Arrays.stream(ex.getRequestURI().getPath().substring("/api".length()).split("/"))
                    .filter(s -> !s.isEmpty())
                    .toArray(String[]::new);

            if (seg.length == 1 && seg[0].equals("export.csv") && method.equals("GET")) {
                byte[] csv = service.exportCsv().getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().set("Content-Type", "text/csv; charset=utf-8");
                ex.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"pocketwise-expenses.csv\"");
                write(ex, 200, csv);
                return;
            }

            sendJson(ex, 200, route(method, seg, ex));
        } catch (ApiException e) {
            sendJson(ex, e.status(), Map.of("error", e.getMessage()));
        } catch (Exception e) {
            e.printStackTrace();
            sendJson(ex, 500, Map.of("error", "Something went wrong on the server. Please try again."));
        } finally {
            ex.close();
        }
    }

    private Object route(String method, String[] seg, HttpExchange ex) throws IOException {
        if (seg.length >= 1 && seg[0].equals("months")) {
            if (seg.length == 1) {
                if (method.equals("GET")) return service.listMonths();
            } else if (seg.length == 2) {
                if (method.equals("GET")) return service.getMonth(seg[1]);
                if (method.equals("PUT")) return service.saveMonth(seg[1], readBody(ex));
            } else if (seg.length == 3 && seg[2].equals("expenses")) {
                if (method.equals("GET")) return service.listExpenses(seg[1]);
                if (method.equals("POST")) return service.addExpense(seg[1], readBody(ex));
            }
        } else if (seg.length == 2 && seg[0].equals("expenses")) {
            long id = parseId(seg[1]);
            if (method.equals("PUT")) return service.updateExpense(id, readBody(ex));
            if (method.equals("DELETE")) return service.deleteExpense(id);
        } else {
            throw ApiException.notFound("There's nothing at that address");
        }
        throw new ApiException(405, "That action isn't supported here");
    }

    private static long parseId(String raw) {
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw ApiException.badRequest("That expense id isn't valid");
        }
    }

    private static Object readBody(HttpExchange ex) throws IOException {
        byte[] bytes = ex.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (bytes.length > MAX_BODY_BYTES) throw ApiException.badRequest("That request is too large");
        if (bytes.length == 0) throw ApiException.badRequest("That request was empty");
        return Json.parse(new String(bytes, StandardCharsets.UTF_8));
    }

    private static void sendJson(HttpExchange ex, int status, Object body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        write(ex, status, Json.stringify(body).getBytes(StandardCharsets.UTF_8));
    }

    private static void write(HttpExchange ex, int status, byte[] bytes) throws IOException {
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}
