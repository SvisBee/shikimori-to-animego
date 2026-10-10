# Участие в разработке / Contributing

## Русский

Спасибо за интерес к проекту. Приветствуются исправления поиска, безопасности, UX, адаптации новых версий AnimeGO и тестов.

1. Откройте issue, описав проблему **без личных данных**, либо создайте fork и Pull Request.
2. Не меняйте массовую запись без воспроизводимого теста: любой сбой может повредить настоящий список пользователя.
3. Запускайте `node --check shikimori-to-animego.user.js` и `node test.js`.
4. Для изменений интерфейса или записи используйте изолированный тест `node tests/ui-smoke.cjs` (необходимы `playwright-core` и Edge).
5. README, CHANGELOG, текст релизов и важные комментарии к коду пишите **на русском и английском**.
6. Не добавляйте пользовательские экспорты Shikimori, отчёты, cookie, токены или реальные профили в репозиторий и скриншоты.
7. Не подключайте скрытые сторонние серверы, аналитику или сбор учётных данных.

Любое изменение API, статусов или оценок должно быть предварительно проверено на синтетических данных и, если требует живого теста, прямо отмечено как непроверенное.

## English

Contributions are welcome: matching accuracy, safety, UI/UX, AnimeGO compatibility fixes and tests.

1. Open an issue **without personal data** or fork the repository and submit a Pull Request.
2. Changes to batch writes must include a deterministic test, since bugs can corrupt a real user's list.
3. Run `node --check shikimori-to-animego.user.js` and `node test.js`.
4. For UI/write logic, run the isolated `node tests/ui-smoke.cjs` test (needs `playwright-core` and Edge).
5. Keep README, CHANGELOG, release notes and important code comments **bilingual RU/EN**.
6. Never commit personal Shikimori exports, reports, cookies, tokens or real profile screenshots.
7. Do not add undisclosed third-party endpoints, analytics or credential collection.

API/status/rating changes must be tested on synthetic data; label any unverified live behavior clearly.

This is an unofficial community project, not affiliated with the source or destination websites.
