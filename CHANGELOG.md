# История изменений / Changelog

## 1.0.0 Stable - Публичный релиз / First stable public release

**RU:** Проект готов к публичной установке как один Tampermonkey-скрипт. Перенос статусов и оценок успешно завершён в реальном пользовательском сценарии (628 статусов и отдельная синхронизация оценок); 12 записей остались без надёжного сопоставления и не были подменены другими сезонами. Переработан README RU/EN с установкой, резервными копиями, ограничениями и приватностью. Добавлены CI для Node.js-тестов, CONTRIBUTING, SECURITY, шаблон issue, тест совместимости JSON-отчётов. Подтверждение оценки привязано к её значению в новых отчётах, при этом старые отчёты v1 продолжают открываться. Явно указаны лицензия и контакты поддержки в метаданных userscript. Критические изменения записи не вносились. Внутренние API AnimeGO не являются стабильными и могут измениться.

**EN:** First stable, publicly installable single-file Tampermonkey release. A real user completed a full migration of 628 supported status entries and independently synced ratings; 12 titles without trustworthy matches were left unresolved rather than mapped to incorrect seasons. Rewrote bilingual installation/backup/limits/privacy documentation, added Node.js CI, CONTRIBUTING, SECURITY, a safe issue template and JSON report compatibility tests. New reports bind confirmed ratings to the exact numeric score while keeping existing v1 reports readable. Userscript metadata now includes license and support links. The proven write flow remains unchanged. AnimeGO's internal endpoints remain undocumented and subject to change.

## 0.7.0 Beta - Отдельная очередь оценок / Dedicated rating synchronization

**RU:** Убрана неоднозначная галочка переноса оценок вместе со статусами. Добавлен отдельный блок с тремя счётчиками: количество оценок Shikimori у тайтлов с перенесёнными статусами, подтверждённые на AnimeGO и ещё не проверенные. Отдельный лимит и кнопка «Указать все оставшиеся» избавляют от необходимости считать вручную. Перед оцениванием сравниваются текущая оценка и статус, совпадающая оценка не перезаписывается; после записи проверяются оба значения. Прогресс оценок сохраняется в JSON-отчёте и локальных checkpoint, независимо от переноса статусов. При ошибке HTTP 403 или несовпадении процесс останавливается. Добавлены Playwright-тесты уже существующей оценки, новой оценки, отказа сервера и сохранности статуса.

**EN:** Removed the confusing "also rate during status import" checkbox. Added a separate rating queue with counters for Shikimori scores on imported titles, verified ratings, and unverified scores. It has its own limit plus an "All remaining" autofill button. The script compares the current rating and status first, skips already matching scores, and verifies both after a rating write. Rating progress persists independently in JSON reports and local checkpoints. HTTP 403 and verification errors halt the batch. Expanded isolated Playwright tests: matching rating, new rating, recovery after a rejected request, and unchanged list statuses.

## 0.6.2 Beta - Подтверждение внутри импортёра / In-app confirmation

**RU:** Убраны системные confirm-диалоги браузера, из-за которых основной интерфейс скрывался и казалось, что прогресс не работает. Подтверждение переноса и очистки автосохранения теперь показывается поверх текущего окна импортёра. После нажатия «Начать перенос» остаётся видна фиксированная панель прогресса. Добавлены проверки отмены кнопкой и Escape, отсутствия запросов до подтверждения, отсутствия браузерных диалогов и восстановления после ошибки.

**EN:** Replaced native browser confirm dialogs that obscured the importer with built-in confirmation panels for batch imports and checkpoint clearing. The fixed progress panel remains visible immediately after approval. Playwright regression tests cover Cancel, Escape, zero writes before approval, no native dialogs, and checkpoint recovery.

## 0.6.1 Beta - Видимый прогресс и автовосстановление / Live progress and checkpoints

**RU:** Панель прогресса вынесена над прокручиваемой областью: видны текущий тайтл, обработанные записи, количество ошибок, кнопки сохранения и остановки, а также причина сбоя. После каждого завершённого тайтла сохраняется локальный checkpoint (ID профиля, ключ записи, результат, короткое сообщение об ошибке). При восстановлении исходного отчёта успешно перенесённые записи пропускаются. Ошибки проверки по-прежнему останавливают процесс. Добавлены браузерные тесты: прерывание после успешной записи, HTTP 403, сохранение и восстановление результатов, отсутствие последующих записей после остановки. Исходный JSON-экспорт в localStorage не сохраняется.

**EN:** Progress and failure details are now pinned above the scroll area, including current title, completed count, errors, Stop and Report actions. A local per-title checkpoint is saved after each processed title and merged when restoring the original JSON report. Verification failures still halt processing. Added browser regression tests for partial success, HTTP 403, checkpoint restoration, and stopping subsequent writes. The full export is never stored in localStorage.

## 0.6.0 Beta - Новый интерфейс / UI redesign

**RU:** Полностью переработано окно импорта: тёмная тема, карточки статистики, поиск, фильтры «готово/проверить/не найдено/перенесено/ошибки», отображение по 50 записей, мобильные карточки и полоска прогресса. Добавлено понятное предупреждение, что фильтр не меняет очередь импорта, а перед подтверждением показываются реальные названия выбранных тайтлов. После завершения поиска кнопки корректно разблокируются. Браузерные Playwright-тесты изолированы от настоящего сайта и используют 640 синтетических записей. Применены подходы из скиллов дизайн-инженерии, QA и UI/UX.

**EN:** Complete import dialog redesign: dark theme, summary counters, search and filters (ready/review/missing/imported/errors), 50-row incremental rendering, mobile cards and progress display. Explicitly warn that filters do not change import order, and show exact target titles in the confirmation prompt. Buttons are correctly re-enabled after scanning. Isolated Playwright browser tests use 640 synthetic records and intercept all AnimeGO network requests. Guidance adapted from existing design-engineering, QA and UI/UX skills.

## 0.5.0 Beta - Отдельный статус «Просмотрено» / Independent Completed status

**RU:** По результатам проверки реального аккаунта обнаружено, что оценка и «Любимые» не означают статус «Просмотрено». Исследован официальный интерфейс `/api/watchlist/{id}`: для завершённых тайтлов доступно `data-fav-list="completed"`. Импорт «Просмотрено» переведён на `/fav/set`, оценка остаётся отдельной необязательной операцией. После записи проверяется фактический список профиля. Все комментарии к важной логике, документация и сведения релиза публикуются на русском и английском. **Автоматическое добавление в «Просмотрено» ещё ожидает живого теста 1 тайтла.**

**EN:** Real-account testing proved that a rating and Favorites are not equivalent to Completed. The AnimeGO watchlist interface (`/api/watchlist/{id}`) exposes `data-fav-list="completed"` for eligible finished titles. Completed now uses `/fav/set`, while ratings remain optional independent operations. The user's Completed profile list is verified after the write. Important code comments, documentation, and release notes are bilingual (RU + EN). **Automated Completed transfer still awaits a one-title live test.**

## 0.4.1 Beta - Откат опасной логики / Safety rollback

**RU:** Запрещён перенос «Просмотрено» через оценку после обнаружения ошибки при тестировании. «Брошено» работает на тестовой записи.

**EN:** Disabled treating rating as Completed after real-account testing exposed the mismatch. Dropped was confirmed in a live test.

## 0.4.0 Beta - Проба оценок / Rating experiment

**RU:** Эксперимент с добавлением просмотренного через оценку. **Не используйте эту версию для «Просмотрено».**

**EN:** Experimental Completed-by-rating flow. **Do not use this version for Completed imports.**

## 0.3.0 Beta - Отчёты / Cached reports

**RU:** Восстановление 640 результатов из отчёта без повторного поиска, точное сравнение пунктуации в названиях.

**EN:** Restore saved search reports without searching again; preserve meaningful title punctuation.

## 0.2.0 Beta - Новый домен / Correct website

**RU:** Поддержка `anime-go.org` (с дефисом), отдельного от `animego.me`.

**EN:** Support for `anime-go.org` (with hyphen), a different website from `animego.me`.

## 0.1.0 Beta - Первая версия / Initial version

**RU:** Первичный импортёр для `animego.me`, не совместимый с текущим целевым сайтом.

**EN:** Initial `animego.me` importer, not compatible with the current target website.
