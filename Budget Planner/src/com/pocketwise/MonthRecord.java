package com.pocketwise;

import java.math.BigDecimal;

/** The salary and budget a student set for one calendar month. */
public final class MonthRecord {
    final String yearMonth;          // yyyy-MM, e.g. 2026-10
    BigDecimal salary;
    BigDecimal budget;
    boolean alert90Sent;             // so the 90% alert fires only once
    boolean alert100Sent;

    MonthRecord(String yearMonth) {
        this.yearMonth = yearMonth;
    }
}
