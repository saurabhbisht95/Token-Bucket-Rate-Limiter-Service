import { pool } from '../db/postgres.js';
import { createAdminKey } from '../repositories/adminKey.repository.js';
import { generateAdminApiKey, getApiKeyPrefix, hashApiKey } from '../utils/apiKey.js';
import { logger } from '../lib/logger.js';

async function main() {
  const name = process.argv[2];

  if (!name) {
    console.error('Usage: node src/scripts/createAdminKey.js <key-name>');
    process.exit(1);
  }

  const rawApiKey = generateAdminApiKey();

  const adminKey = await createAdminKey({
    name,
    keyPrefix: getApiKeyPrefix(rawApiKey),
    keyHash: hashApiKey(rawApiKey)
  });

  console.log('\nAdmin API key created successfully.');
  console.log('Save this key now. It will not be shown again.\n');

  console.log(`Name: ${adminKey.name}`);
  console.log(`Prefix: ${adminKey.keyPrefix}`);
  console.log(`API Key: ${rawApiKey}\n`);
}

main()
  .catch((err) => {
    logger.error({ err }, 'Failed to create admin API key');
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });