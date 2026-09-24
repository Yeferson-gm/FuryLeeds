import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { db, sqlClient } from '../src/lib/db';

await migrate(db, { migrationsFolder: './drizzle' });
await sqlClient.close();

console.log('Migraciones aplicadas correctamente.');
