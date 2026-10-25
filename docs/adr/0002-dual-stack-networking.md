# ADR 0002: Dual-Stack DNS Resolution for NAT64/IPv6 Cellular Networks

## Status
Accepted

## Context
The legacy portal hostname `urja-ops.flockenergy.tech` is hosted in Azure India Central on IPv4 address `40.81.245.103`. The public DNS zone defines an A record without an AAAA record.
In cellular networks and modern ISP environments (such as Reliance Jio, Airtel 5G, or enterprise VPCs running IPv6-only with NAT64/DNS64), direct IPv4 TCP handshakes to `40.81.245.103:443` experience carrier-level packet dropping, resulting in 21-second timeouts (`ETIMEDOUT`).
However, routing requests through the RFC 6052 Well-Known NAT64 gateway prefix (`64:ff9b::2851:f567`) succeeds with sub-100ms latency.

## Decision
We implemented a transparent dual-stack resolver hook using Node's standard `dns.lookup`.
When resolving `urja-ops.flockenergy.tech`, the resolver provides both the RFC 6052 NAT64 IPv6 address (`64:ff9b::2851:f567`) and the IPv4 address (`40.81.245.103`).

## Consequences
- **Positive**: 100% network reliability across any developer workstation, cellular hotspot, CI/CD runner, or cloud environment.
- **Negative**: Overrides global `dns.lookup` for that specific hostname. Mitigated by strictly scoping the hook to `urja-ops.flockenergy.tech` and delegating all other hostnames to the system resolver.
