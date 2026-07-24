# Protocol Discovery & Analysis: Urja Meter Ops

## Executive Overview
The legacy Urja Meter Ops portal (`https://urja-ops.flockenergy.tech`) operates on a traditional Server-Side Rendered (SSR) architecture, identified as SvelteKit. Extensive network analysis confirms the absence of internal JSON APIs or GraphQL endpoints. Consequently, data extraction necessitates parsing dynamic HTML structures via authenticated sessions.

## Authentication Mechanics
- **Endpoint**: `POST /login`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Payload Parameters**: `email` and `password`
- **Security Posture & Constraints**:
  - The legacy backend enforces strict Cross-Site Request Forgery (CSRF) protections by validating the `Origin` header. Requests lacking an `Origin` matching `https://urja-ops.flockenergy.tech` are uniformly rejected with a `403 Forbidden` status.
- **Session Establishment**: 
  - Upon successful credential validation, the server responds with a `303 See Other` redirect.
  - A secure session cookie (`__Secure-better-auth.session_token`) is established, which must be passed in subsequent requests to access protected routes.

## Route Topology & Data Structures

### 1. `GET /meters`
- **Purpose**: Retrieves the inventory of smart meters associated with the authenticated profile.
- **Response Format**: HTML Document.
- **DOM Structure**: Data is embedded within a standard HTML `<table>`. The identified columns are: `Meter`, `Serial`, `Make`, `Phase`, `Status`, and `DT`.
- **Edge Cases**: In scenarios where no hardware is assigned to the profile, the table body renders a single-cell row containing the exact string: `"No meters found."`

### 2. `GET /transformers` (Network Hierarchy)
- **Purpose**: Provides topological data regarding the transformer network.
- **Response Format**: HTML Document.
- **DOM Structure**: A tabular format outlining `Location` and `Capacity` metrics for each transformer unit.

### 3. `GET /meters/{id}`
- **Purpose**: Exposes specific diagnostic and configuration details for an individual meter.
- **Response Format**: HTML Document.
- **DOM Structure**: The implementation extracts data by targeting specific DOM identifiers (e.g., `#meter-serial`) and utility classes (e.g., `.status-value`).

### 4. `GET /meters/{id}/consumption`
- **Purpose**: Exposes historical energy consumption metrics.
- **Response Format**: HTML Document.
- **DOM Structure**: A chronological table detailing timestamps and corresponding usage readings.

## Data Normalization Strategy
Given the reliance on HTML extraction, the API integration layer must programmatically traverse the DOM. The strategy involves isolating target tables, mapping column indices to standardized JSON keys, and rigorously stripping extraneous whitespace or newline artifacts. To ensure downstream reliability, the parser is designed to handle empty states gracefully, returning an empty array `[]` rather than throwing indexing exceptions when standardized error strings are encountered.
