package com.pocketwise;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A tiny JSON reader/writer so the project needs no libraries.
 * Parsed values are: Map (object), List (array), String, BigDecimal, Boolean or null.
 */
public final class Json {
    private Json() {}

    // ------------------------------------------------------------------ write

    public static String stringify(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object v) {
        if (v == null) {
            sb.append("null");
        } else if (v instanceof String || v instanceof java.time.LocalDate) {
            writeString(sb, v.toString());
        } else if (v instanceof BigDecimal d) {
            sb.append(d.toPlainString());
        } else if (v instanceof Number || v instanceof Boolean) {
            sb.append(v);
        } else if (v instanceof Map<?, ?> map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : map.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                writeString(sb, String.valueOf(e.getKey()));
                sb.append(':');
                write(sb, e.getValue());
            }
            sb.append('}');
        } else if (v instanceof Iterable<?> list) {
            sb.append('[');
            boolean first = true;
            for (Object item : list) {
                if (!first) sb.append(',');
                first = false;
                write(sb, item);
            }
            sb.append(']');
        } else {
            throw new IllegalArgumentException("Can't write " + v.getClass());
        }
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }

    // ------------------------------------------------------------------- read

    public static Object parse(String text) {
        Parser p = new Parser(text);
        p.skipSpace();
        Object result = p.readValue();
        p.skipSpace();
        if (p.pos != text.length()) throw p.fail();
        return result;
    }

    private static final class Parser {
        private final String s;
        private int pos;

        Parser(String s) {
            this.s = s;
        }

        ApiException fail() {
            return ApiException.badRequest("That request couldn't be read. Check the values and try again");
        }

        void skipSpace() {
            while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++;
        }

        Object readValue() {
            if (pos >= s.length()) throw fail();
            char c = s.charAt(pos);
            if (c == '{') return readObject();
            if (c == '[') return readArray();
            if (c == '"') return readString();
            if (s.startsWith("true", pos)) { pos += 4; return Boolean.TRUE; }
            if (s.startsWith("false", pos)) { pos += 5; return Boolean.FALSE; }
            if (s.startsWith("null", pos)) { pos += 4; return null; }
            return readNumber();
        }

        Map<String, Object> readObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            pos++; // {
            skipSpace();
            if (peek() == '}') { pos++; return map; }
            while (true) {
                skipSpace();
                if (peek() != '"') throw fail();
                String key = readString();
                skipSpace();
                expect(':');
                skipSpace();
                map.put(key, readValue());
                skipSpace();
                if (peek() == ',') { pos++; continue; }
                expect('}');
                return map;
            }
        }

        List<Object> readArray() {
            List<Object> list = new ArrayList<>();
            pos++; // [
            skipSpace();
            if (peek() == ']') { pos++; return list; }
            while (true) {
                skipSpace();
                list.add(readValue());
                skipSpace();
                if (peek() == ',') { pos++; continue; }
                expect(']');
                return list;
            }
        }

        String readString() {
            StringBuilder sb = new StringBuilder();
            pos++; // opening quote
            while (true) {
                if (pos >= s.length()) throw fail();
                char c = s.charAt(pos++);
                if (c == '"') return sb.toString();
                if (c != '\\') { sb.append(c); continue; }
                if (pos >= s.length()) throw fail();
                char e = s.charAt(pos++);
                switch (e) {
                    case '"' -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    case '/' -> sb.append('/');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        if (pos + 4 > s.length()) throw fail();
                        try {
                            sb.append((char) Integer.parseInt(s.substring(pos, pos + 4), 16));
                        } catch (NumberFormatException ex) {
                            throw fail();
                        }
                        pos += 4;
                    }
                    default -> throw fail();
                }
            }
        }

        BigDecimal readNumber() {
            int start = pos;
            while (pos < s.length() && "+-0123456789.eE".indexOf(s.charAt(pos)) >= 0) pos++;
            if (start == pos) throw fail();
            try {
                return new BigDecimal(s.substring(start, pos));
            } catch (NumberFormatException ex) {
                throw fail();
            }
        }

        char peek() {
            if (pos >= s.length()) throw fail();
            return s.charAt(pos);
        }

        void expect(char c) {
            if (peek() != c) throw fail();
            pos++;
        }
    }
}
