import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { AuthService } from '../auth.js';
import { Database } from '../database.js';

const args = process.argv.slice(2);
const usernameArg = option(args, '--username');
const passwordArg = option(args, '--password');
const terminal = createInterface({ input: stdin, output: stdout });

try {
  const username = usernameArg ?? (await terminal.question('Admin username: '));
  const password = passwordArg ?? (await terminal.question('Admin password (input is visible): '));
  const db = new Database();
  const auth = new AuthService(db);
  const existing = db.get<{ id: string }>('SELECT id FROM users WHERE username = ?', username.trim());
  if (existing) {
    db.run('UPDATE users SET is_admin = 1 WHERE id = ?', existing.id);
    console.log(`Promoted ${username.trim()} to administrator.`);
  } else {
    await auth.createUser(username, password, true);
    console.log(`Created administrator ${username.trim()}.`);
  }
  db.close();
} finally {
  terminal.close();
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
