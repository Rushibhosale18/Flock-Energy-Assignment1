# Reflection

### What assumptions did you make?
I assumed that the credentials provided (`operator@urja.local`) were meant to represent a single-operator environment. This allowed me to simplify session management by maintaining a centralized, in-memory `CookieJar` in the Node.js adapter, avoiding the complexity of dynamic JWT-to-session routing that would be necessary in a true multi-tenant proxy environment. I also assumed that because the legacy portal heavily relies on server-side rendered (SSR) tables, the HTML structure (e.g., column indices) remains relatively stable across updates.

### Which part was the most difficult, and how did you get unstuck?
Bypassing the legacy portal's strict Cross-Site Request Forgery (CSRF) protections on the `/login` endpoint was the most challenging component. Initial programmatic POST requests were consistently rejected with a `403 Forbidden` status ("Cross-site POST form submissions are forbidden"). I got unstuck by meticulously simulating browser behavior in Chrome DevTools and identifying that the SvelteKit backend did not rely on standard embedded CSRF tokens, but rather strictly validated the `Origin` and `Content-Type` HTTP headers. Mimicking these headers in the Axios configuration immediately resolved the blockage.

### If you had another day, what would you improve?
I would prioritize decoupling the session state. Currently, the `CookieJar` is monolithic in memory. I would implement a distributed caching layer (like Redis) to store cookie sessions keyed against secure API tokens, allowing the wrapper to scale horizontally and serve multiple operators concurrently. Additionally, I would implement an LLM-assisted or heuristic parsing strategy to make the HTML data extraction more resilient against unforeseen UI/DOM modifications by the legacy frontend team.

### What mistake did you make while solving this (there's always one)?
Early in the implementation, I incorrectly assumed that standard hidden form fields would contain the necessary CSRF tokens. My initial reconnaissance script spent too much logic parsing the DOM for `<meta name="csrf-token">` and `<input type="hidden">` tags, causing my payload to fail. This mistake cost me time, but it reinforced the lesson that network-level constraints (like the `Origin` header) often supersede application-level token checks in modern frameworks.

### If you were reviewing your own submission, what would you criticise?
If I were reviewing my own code, I would criticize the fragility of the `cheerio` HTML parsing logic. While I used generic CSS selectors to map table columns, it is still inherently brittle: if the legacy team injects a new column into the `/meters` table, the indexing logic will skew, and the API will return misaligned JSON. A more robust implementation would dynamically resolve column indices by strictly matching the text in the `<thead>` elements prior to parsing the `<tbody>`, ensuring the parser adapts automatically to structural layout shifts.
