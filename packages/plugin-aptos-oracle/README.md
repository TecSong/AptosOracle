# Aptos Oracle Plugin for Eliza OS

This plugin provides integration with the Aptos blockchain ecosystem, allowing Eliza agents to interact with Aptos tokens, analyze social media trends, and perform token operations.

## Features

- Fetch token details from Aptos network
- Transfer tokens between addresses
- Swap tokens on Aptos DEXes
- Analyze social media trends for market insights

## Installation

```bash
npx elizaos plugins add @elizaos/plugin-aptos-oracle
```

## Usage

Add the plugin to your character's configuration:

```json
{
  "name": "AptosOracle",
  "plugins": [
    "@elizaos/plugin-aptos-oracle"
  ],
  // ... other character configuration
}
```

## Available Actions

### FETCH_TOKEN_DETAILS

Fetches detailed information about a specific token on the Aptos network.

Example:
```
Show me details about APT token
```

### TRANSFER_TOKEN

Transfers tokens from the user's wallet to another address on the Aptos network.

Example:
```
Transfer 10 APT to 0x123...
```

### SWAP_TOKEN

Swaps one token for another on the Aptos network.

Example:
```
Swap 5 APT to USDC
```

## Environment Variables

- `APTOS_ORACLE_API_KEY`: API key for Aptos services (optional)
- `APTOS_ORACLE_API_ENDPOINT`: Custom API endpoint (defaults to Aptos mainnet)
- `APTOS_ORACLE_NETWORK_ID`: Network ID (defaults to 'mainnet')

## License

MIT
