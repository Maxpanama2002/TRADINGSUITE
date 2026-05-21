#!/bin/bash
# Двойной клик → запускает Trading Suite в режиме разработки
cd "$(dirname "$0")"
exec npm start
