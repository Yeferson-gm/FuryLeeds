import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { closeDatabase, db } from '../src/lib/db';

await migrate(db, { migrationsFolder: './drizzle' });
await closeDatabase();

console.log('Migraciones aplicadas correctamente.');
