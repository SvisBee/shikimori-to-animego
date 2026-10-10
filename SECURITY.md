# Безопасность / Security

## Русский

Этот userscript запускается **на anime-go.org** в контексте авторизованной сессии пользователя. Изменения внутреннего API AnimeGO могут приводить к неправильным действиям, поэтому встроены ручное подтверждение, ограничение партий, проверка результатов, остановка при ошибках и локальное восстановление.

- Исходный Shikimori JSON обрабатывается локально в браузере и не отправляется разработчику.
- Поиск и изменения выполняются через **неофициальные эндпоинты anime-go.org**.
- Состояние checkpoint хранится в `localStorage` на домене anime-go.org. Администраторы сайта и его клиентские скрипты потенциально могут получить доступ к данным этого хранилища.
- **Никогда не делитесь** экспортами/отчётами, cookie, токенами или записью сетевого трафика с учётными данными в публичных issues.
- Используйте только понятный источник установки, проверяйте адрес домена; сохраняйте резервные копии, начинайте с небольшой партии.
- Для чувствительного сообщения о безопасности обратитесь к мейнтейнеру через [GitHub репозиторий](https://github.com/SvisBee/shikimori-to-animego) с минимальным объёмом данных. Не публикуйте действующие секреты.

## English

This userscript runs **on anime-go.org** using the user's signed-in browser session. The site's undocumented APIs may change, so the script requires confirmation, limits batches, verifies results, stops on failures and supports local checkpoints.

- Shikimori JSON exports are processed in the browser, not uploaded to the project's maintainer.
- Search and write requests use **unofficial anime-go.org endpoints**.
- Checkpoints reside in the anime-go.org origin's `localStorage`, potentially readable by the website and its scripts.
- **Never post** private exports, reports, cookies, tokens or credential-bearing HTTP traces to public issues.
- Install from a known source, verify the domain, retain backups and test small batches first.
- For sensitive security reports, contact the maintainer via the [GitHub repository](https://github.com/SvisBee/shikimori-to-animego) using minimal information; never disclose live secrets publicly.
