# ADR 0001: Analysis-first product scope

## Decision

60s History Marketing OS is an analytics and content-intelligence platform. Internal
video rendering, provider inference, artifact storage, background production workers,
YouTube upload, and public publishing are outside the active product scope.

## Context

The provider pipeline produced unreliable output and introduced provider, storage, and
worker failure modes. Those concerns distracted from the channel intelligence loop:
measured YouTube data, evidence-backed recommendations, research, experiments, and
human-reviewed scripts.

## Consequences

The application keeps YouTube read access, analytics sync, owner isolation, insights,
experiments, MCP handoff, and script review. Approved drafts are prepared for external
editing tools. Existing production tables and audit events are preserved as read-only
history. Retired routes remain tombstones so old clients fail safely with `410 Gone`.

## Revisit condition

An external editing integration can be considered after the intelligence loop has
reliable evidence, export formats, and a separately reviewed cost and quality plan.
