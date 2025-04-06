# Zpinc in Practice: Zero-Trust Security in the MlesTalk Application

## Abstract

Modern secure messaging applications face a critical challenge: how to provide comprehensive security features without requiring users to trust server infrastructure. While many popular solutions offer robust encryption, they still depend on servers for key management and message delivery, creating potential vulnerabilities. This article explores how the Zpinc protocol addresses this challenge through its zero-trust approach, and specifically examines its practical implementation in the MlesTalk Android messaging application. By analyzing the source code of MlesTalk's Zpinc protocol implementation, we reveal how theoretical security concepts translate into working software that protects user communications.

## Introduction

The need for secure communication tools has never been greater. As our digital interactions increase, so do concerns about privacy, data security, and the trustworthiness of the infrastructure carrying our messages. In response to these concerns, the Zpinc protocol was developed as a novel solution that provides modern secure group messaging features without requiring trust in server infrastructure.

MlesTalk, an Android messaging application, implements the Zpinc protocol, demonstrating how theoretical security concepts can be practically applied. This article examines the implementation details of Zpinc within MlesTalk, highlighting how the application achieves secure communication while maintaining usability.

## The Zpinc Protocol: Core Principles

The Zpinc protocol, as outlined in the original research, is built around several key principles:

1. **Zero-Trust Server Architecture**: The server is treated as potentially untrusted and holds no cryptographic material necessary for secure messaging.
2. **Publish-Subscribe Pattern**: Messages are distributed through channels without the server knowing who will receive them.
3. **Memory-Hard Function (MHF)**: Passwords are processed through an MHF to derive high-entropy keys.
4. **Authenticated Encryption with Associated Data (AEAD)**: All communications are encrypted and authenticated.
5. **Forward Secrecy and Post-Compromise Security**: Through ephemeral keys and the Burmester-Desmedt (BD) key exchange.

## MlesTalk's Implementation of Zpinc

### Zero-Trust Server Architecture

MlesTalk implements the zero-trust principle by isolating cryptographic operations on the client side. The server acts as a message relay without access to message content.

When a user sends a message, the content is never transmitted in plaintext. Instead, the MlesTalk client:
1. Encrypts the message content using keys that remain on the client
2. Generates validation hashes for message integrity verification
3. Structures data packets that include encrypted channel names and user identifiers

All cryptographic operations are handled exclusively on the client side. This architectural decision prevents the server from accessing unencrypted message content, user IDs, or cryptographic keys.

#### Server-Side Implementation

The server-side component of MlesTalk follows the Mles v2 protocol specification. The connection process begins with an initial JSON-formatted message that establishes the WebSocket session:

```
{
    "uid":"<user identification>",
    "channel":"<selected channel>",
    "auth":"<optional authentication hash>"
}
```

This initial frame contains the encrypted user ID, encrypted channel name, and optional authentication data. The client must set the Sec-WebSocket-Protocol subprotocol to "mles-websocket" to establish a connection with the Mles server.

After verifying this initial frame, the server joins the client to the specified channel, and subsequent message framing is determined by the application. Each channel operates in its own context, independent of other channels, with a separate TLS session per (uid, channel) pair.

The Mles server may store message history, which can be distributed to new clients upon connection. This allows for asynchronous message delivery even when recipients are offline. The server architecture supports resynchronization through peers, enabling distributed data protection for channel information.

This server architecture complements the zero-trust model by only handling encrypted data packets without requiring access to the cryptographic keys needed for decryption. The server functions purely as a message relay and channel manager without the capability to read or modify message contents.

### Shared Key Generation with MHF

The Zpinc protocol uses a Memory-Hard Function (MHF) to derive high-entropy keys from passwords. In MlesTalk, this is implemented using the scrypt algorithm as specified in the prototype implementation.

The application enforces security requirements through:

- A minimum acceptable password length of 12 characters
- Input validation in the user interface that provides feedback on password strength
- A built-in generator for cryptographically secure random passwords

When a user creates or joins a channel, the password is processed through the scrypt MHF to derive cryptographic keys. This derivation process is deliberately resource-intensive to resist brute-force attacks. From the master key derived via scrypt, the system generates separate keys for:

- Channel encryption and identification
- Message encryption
- User identifier encryption

These mechanisms help ensure passwords meet minimum security requirements to resist brute-force attacks.

### Message Encryption and Authenticated Encryption with AEAD

Message encryption in MlesTalk is implemented using XSalsa20-Poly1305, an authenticated encryption scheme. This approach provides both confidentiality and integrity for all communications.

The implementation utilizes TweetNaCl, a compact implementation of the NaCl cryptographic library. TweetNaCl provides the XSalsa20 stream cipher and Poly1305 message authentication code that form the basis of the secretbox primitive used for authenticated encryption.

#### Message Structure and Encryption

The complete message structure in MlesTalk includes several components:

1. **Message Header**: Contains critical metadata including:
   - Version and message size indicators
   - Session ID (randomly generated for each communication session)
   - Key size for any attached cryptographic material
   - Timestamps (using an efficient week-based timestamp format)
   - Flags indicating message type and properties

2. **Message Body**: The actual content to be transmitted

3. **Cryptographic Material**: Any cryptographic keys needed for the BD key exchange

4. **Padding**: Optional padding to protect against traffic analysis

The encryption process follows these steps:

1. A 32-byte nonce is generated using a cryptographically secure random number generator
2. The header, message body, and cryptographic material are combined
3. The XSalsa20 stream cipher encrypts this combined data using the appropriate message key
4. A BLAKE2b-based HMAC is calculated over the nonce and encrypted data using the channel key
5. The nonce, encrypted data, and HMAC are combined into the final message

#### Authentication and Integrity Protection

Each message includes an HMAC (Hash-based Message Authentication Code) calculated using BLAKE2b with domain separation for different keys. This provides:

- Authentication of the message source
- Integrity verification to detect any tampering
- Protection against replay attacks through the use of unique nonces

The HMAC verification process is implemented with constant-time comparison operations to prevent timing attacks. During message reception, the system checks the HMAC against multiple possible keys (regular key, current BD key, previous BD key) to support key rotation and forward secrecy.

#### Key Separation and Domain Isolation

For each encryption operation, distinct keys are derived using domain separation techniques:

- Message content encryption keys
- Channel name encryption keys
- User identifier encryption keys
- Authentication keys for HMAC calculation

This approach ensures cryptographic separation between the different types of encrypted data, preventing potential attacks that might leverage one encryption context to compromise another.

The implementation includes proper key derivation for different purposes, using a HKDF-like construction based on BLAKE2b keyed hashing. This provides cryptographic separation between keys used for different purposes, enhancing security.

### Forward Secrecy and Post-Compromise Security

The Zpinc protocol achieves forward secrecy and post-compromise security through the Burmester-Desmedt (BD) key exchange system. MlesTalk implements this with a BD key manager that handles the cryptographic operations required.

#### BD Key Exchange Process

The BD key exchange process involves:

1. Each participant generates an ephemeral key pair using the Ristretto255 elliptic curve
2. Public keys are exchanged among all participants in the channel
3. Each participant computes adjacent key differences based on the position in the participant list
4. A multi-step calculation combines these differences to derive a shared secret
5. The shared secret is then used to generate new encryption keys

For security, the implementation includes several components:

- **Constant-time operations**: Cryptographic comparisons use constant-time techniques to prevent timing attacks
- **Group key derivation**: A base point is derived from the session ID and channel key using BLAKE2b
- **Key verification**: Verification steps ensure the integrity of exchanged keys
- **Acknowledgment system**: An acknowledgment protocol confirms that all participants have completed the key exchange

#### Key Rotation and Security States

MlesTalk tracks the forward secrecy status and manages transitions between non-forward-secret and forward-secret states. When forward secrecy is active, the application uses encryption keys derived from the BD key exchange process, rather than the original password-derived keys.

The implementation maintains multiple key sets:
- Current password-derived keys
- BD-derived keys (when forward secrecy is active)

This key management approach ensures that:
1. Messages can be decrypted if they arrive out of order
2. Forward secrecy is maintained during network disruptions
3. The system can recover from communication issues without compromising security

#### Dynamic Group Management

The BD protocol implementation handles dynamically changing group membership, ensuring that new keys are established when participants join or leave a conversation. The implementation manages this state transition to maintain security properties.

When the system detects a change in group membership through session ID changes, it:
1. Reinitializes the cryptographic state
2. Generates new ephemeral keys
3. Restarts the BD key exchange process
4. Transitions to the new security state once the exchange completes

This approach provides post-compromise security by establishing new keys whenever the group composition changes.

### Secure Cryptographic Key Management

The MlesTalk implementation includes comprehensive key management, including secure key derivation and proper cleanup of sensitive materials. The system implements:

- A HKDF-like key derivation process based on BLAKE2b for generating purpose-specific keys
- Cryptographically secure random number generation for creating ephemeral keys
- Memory wiping techniques to remove sensitive cryptographic material from memory after use
- Constant-time comparison operations for critical security checks to prevent timing attacks

These practices adhere to cryptographic best practices, ensuring that keys are properly derived, separated by purpose, and securely managed.

## User Experience and Security

MlesTalk balances security with usability in several ways:

### QR Code Sharing

The application includes a QR code feature to facilitate secure channel sharing. This allows users to easily share channel information, including:

- The channel name
- The shared encryption key (password)
- The server address

When a user wishes to share access to a channel, they can display a QR code that encodes this information. Another user can scan this code to automatically join the channel without manually entering the details. 

A key advantage of this approach is that it bypasses server involvement in the sharing process. The sensitive information—particularly the encryption key—is transferred directly between devices without traversing the server infrastructure. This maintains the zero-trust principle by ensuring that cryptographic material is exchanged through out-of-band channels rather than through the messaging infrastructure itself.

This feature streamlines the otherwise complex process of securely exchanging channel names and encryption keys, enhancing usability without compromising security.

### Visual Security Indicators

MlesTalk provides visual cues to indicate when forward secrecy is active. Messages protected by forward secrecy are displayed with a different color to indicate their enhanced security status. This visual feedback helps users understand the security properties of their communications without requiring technical knowledge.

### Message Synchronization and Resilience

MlesTalk implements sophisticated message synchronization to handle network disruptions. The system:

1. Maintains a queue of sent messages to enable resynchronization
2. Implements a reconnection mechanism with exponential backoff
3. Handles message resending for missed communications
4. Manages presence notifications to track participant availability

These mechanisms ensure that messages are reliably delivered even in challenging network conditions, enhancing both security and usability.

## Security Considerations and Best Practices

The MlesTalk implementation demonstrates several security best practices:

### Memory Protection

The code regularly wipes sensitive data from memory after use, which helps prevent memory disclosure attacks. This includes wiping:

- Cryptographic keys after they are no longer needed
- Message digests after verification
- Ephemeral values used in key exchange
- Sensitive intermediate calculation results

This systematic approach to memory hygiene significantly reduces the risk of sensitive data exposure through memory dumps or side-channel attacks.

### Constant-Time Operations

Critical security operations use constant-time comparisons to prevent timing attacks. This applies to:

- Message authentication code verification
- Cryptographic key comparison
- BD key validation

Constant-time comparisons ensure that the time taken to perform these operations does not leak information about the data being compared, closing a potential side-channel attack vector.

### Strong Random Number Generation

The implementation uses cryptographically secure random number generation through the Web Crypto API. This ensures unpredictable random values for security-critical operations, including:

- Generating ephemeral keys for the BD exchange
- Creating nonces for encryption
- Producing secure passwords with the built-in generator

## Message Flow and Conversation Processing

### Session Management

MlesTalk implements a session-based communication system as part of the Zpinc protocol. Each channel's communication begins with a session establishment process:

1. A random session ID is generated for each channel
2. This session ID is included in all messages sent within the channel
3. When participants receive matching session IDs, they consider themselves part of the same communication session
4. Changes in session IDs trigger reinitialization of cryptographic states

This session-based approach provides several advantages:

- Clear delineation between different communication episodes
- Automatic reset of cryptographic material when needed
- Support for both synchronous and asynchronous communication patterns

### Notes and Conversations

MlesTalk implements the Zpinc protocol's distinction between notes and conversations:

1. **Notes**: Initial communications using password-derived keys
2. **Conversations**: Communications protected by the BD key exchange with forward secrecy

When users first join a channel, they communicate using notes - messages encrypted with keys derived from the shared password. While secure, these messages do not provide forward secrecy.

Once multiple participants are active in a channel simultaneously, the application initiates the BD handshake process automatically. After a successful handshake, communication transitions to conversation mode, where messages are encrypted with keys derived from the BD exchange, providing forward secrecy.

### Message Processing Flow

The complete message processing flow includes:

1. **Message Reception**: Incoming messages are received via the WebSocket connection and decoded from CBOR format
2. **Authentication**: The message HMAC is verified using multiple potential keys to support different security contexts
3. **Decryption**: Once authenticated, the message content is decrypted using the appropriate key
4. **Session Processing**: Session IDs are extracted and managed to maintain proper communication state
5. **BD Key Exchange**: If cryptographic material is present, the BD key exchange process is advanced
6. **Content Delivery**: Finally, the decrypted and verified message is delivered to the user interface

For outgoing messages, the process is reversed:
1. **Message Preparation**: User content is prepared with appropriate headers and timestamps
2. **Key Selection**: The appropriate encryption keys are selected based on current security state
3. **Encryption**: The message is encrypted using the selected keys
4. **HMAC Calculation**: An authentication code is calculated to ensure integrity
5. **Transmission**: The complete message is encoded in CBOR format and transmitted

This dual-mode approach allows for both asynchronous communication (when not all participants are online) and enhanced security (when participants are simultaneously active).

## Conclusion

The MlesTalk implementation of the Zpinc protocol demonstrates how cryptographic concepts can be translated into practical, usable software. By following the zero-trust principle, MlesTalk provides secure messaging without requiring users to trust server infrastructure.

Key aspects of the implementation include:

1. Client-side encryption and key management using established cryptographic primitives
2. Memory-hard key derivation from passwords with scrypt
3. XSalsa20-Poly1305 authenticated encryption for message confidentiality and integrity
4. The Burmester-Desmedt key exchange for forward secrecy and post-compromise security
5. User-friendly features like QR code sharing and visual security indicators

As messaging applications continue to evolve, the principles and techniques demonstrated in MlesTalk's implementation of Zpinc provide a model for building secure communication tools that protect user privacy and data security without compromising on usability.

## Acknowledgements

Anthropic Claude 3.7 Sonnet did most of the work on this article. Thanks!

## References

1. The Zpinc Protocol specification
2. MlesTalk source code and documentation
3. Burmester, M. and Desmedt, Y., "A Secure and Efficient Conference Key Distribution System", 1994
4. Percival, C., "Stronger key derivation via sequential memory-hard functions", 2009
5. Bernstein, D.J., "XSalsa20 and Poly1305 for authenticated encryption", 2008
