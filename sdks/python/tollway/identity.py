"""
Tollway agent identity parsing and Ed25519 signature verification.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Mapping

import base58
import nacl.signing
import nacl.exceptions


# Multicodec prefix for Ed25519 public keys: 0xed 0x01
_ED25519_MULTICODEC_PREFIX = bytes([0xED, 0x01])


@dataclass
class AgentIdentity:
    """Parsed Tollway agent identity from HTTP headers."""

    did: str
    purpose: str
    scope: str
    nonce: str
    timestamp: str
    signature: str | None = None
    principal_did: str | None = None
    wallet: str | None = None
    framework: str | None = None
    reputation_oracle: str | None = None
    version: str | None = None
    verified: bool = field(default=False, init=False)


def parse_agent_identity(
    headers: Mapping[str, str],
) -> AgentIdentity | None:
    """
    Parse Tollway identity headers into an :class:`AgentIdentity`.

    Returns ``None`` when the minimum required headers are absent (i.e. this is
    not a Tollway request at all).
    """

    def _get(name: str) -> str | None:
        # Header lookup is case-insensitive.
        return headers.get(name) or headers.get(name.lower())

    did = _get("X-Tollway-DID")
    purpose = _get("X-Tollway-Purpose")
    scope = _get("X-Tollway-Scope")
    nonce = _get("X-Tollway-Nonce")
    timestamp = _get("X-Tollway-Timestamp")

    if not all([did, purpose, scope, nonce, timestamp]):
        return None

    # At this point all five required fields are non-None strings.
    assert did and purpose and scope and nonce and timestamp

    return AgentIdentity(
        did=did,
        purpose=purpose,
        scope=scope,
        nonce=nonce,
        timestamp=timestamp,
        signature=_get("X-Tollway-Signature"),
        principal_did=_get("X-Tollway-Principal"),
        wallet=_get("X-Tollway-Wallet"),
        framework=_get("X-Tollway-Framework"),
        reputation_oracle=_get("X-Tollway-Reputation-Oracle"),
        version=_get("X-Tollway-Version"),
    )


def _public_key_from_did(did: str) -> nacl.signing.VerifyKey | None:
    """
    Derive a PyNaCl :class:`~nacl.signing.VerifyKey` from a ``did:key:z…``
    identifier.

    Returns ``None`` on any parse failure so callers can treat invalid DIDs as
    unverifiable rather than raising.
    """
    if not did.startswith("did:key:"):
        return None

    multibase_value = did[len("did:key:"):]
    if not multibase_value.startswith("z"):
        return None

    try:
        decoded = base58.b58decode(multibase_value[1:])
    except Exception:
        return None

    if len(decoded) != 34:
        return None
    if decoded[:2] != _ED25519_MULTICODEC_PREFIX:
        return None

    public_key_bytes = decoded[2:]
    try:
        return nacl.signing.VerifyKey(public_key_bytes)
    except Exception:
        return None


def _build_canonical_string(
    identity: AgentIdentity,
    method: str,
    url: str,
) -> str:
    """Produce the newline-joined canonical string that was signed."""
    return "\n".join(
        [
            identity.did,
            identity.purpose,
            identity.scope,
            identity.nonce,
            identity.timestamp,
            method.upper(),
            url,
        ]
    )


def verify_signature(
    identity: AgentIdentity,
    method: str,
    url: str,
) -> bool:
    """
    Verify the Ed25519 signature on *identity* for a given *method* and *url*.

    The signature is expected to be base64url-encoded (no padding required).
    Returns ``False`` on any failure — missing signature, bad DID, invalid
    bytes, or cryptographic mismatch.
    """
    if not identity.signature:
        return False

    verify_key = _public_key_from_did(identity.did)
    if verify_key is None:
        return False

    try:
        # base64url decode (add padding if needed)
        sig_b64 = identity.signature
        # Pad to a multiple of 4
        padding = (4 - len(sig_b64) % 4) % 4
        sig_bytes = base64.urlsafe_b64decode(sig_b64 + "=" * padding)
    except Exception:
        return False

    canonical = _build_canonical_string(identity, method, url)

    try:
        verify_key.verify(canonical.encode("utf-8"), sig_bytes)
        return True
    except nacl.exceptions.BadSignatureError:
        return False
    except Exception:
        return False
