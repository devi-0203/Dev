package com.pocketwise;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One thing the student spent money on. */
public final class Expense {
    final long id;
    final String yearMonth;          // the month it belongs to
    BigDecimal amount;
    String category;
    String note;                     // may be null
    LocalDate date;

    Expense(long id, String yearMonth, BigDecimal amount, String category, String note, LocalDate date) {
        this.id = id;
        this.yearMonth = yearMonth;
        this.amount = amount;
        this.category = category;
        this.note = note;
        this.date = date;
    }
}
