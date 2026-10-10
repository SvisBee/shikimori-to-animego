# История изменений / Changelog

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
