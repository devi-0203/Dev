#!/bin/sh
# Compiles and starts Pocketwise. Needs a JDK (17 or newer).
cd "$(dirname "$0")" || exit 1
mkdir -p out
javac -d out src/com/pocketwise/*.java && java -cp out com.pocketwise.Main
