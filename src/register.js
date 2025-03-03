import * as commands from './commands.js';
import dotenv from 'dotenv';
import process from 'node:process';

/**
 * Registers role connection/command metadata with Discord - runs separately to the bot.
 */

dotenv.config({ path: '.dev.vars' });

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token) {
  throw new Error('The DISCORD_TOKEN environment variable is required.');
}
if (!applicationId) {
  throw new Error(
    'The DISCORD_APPLICATION_ID environment variable is required.'
  );
}

async function register(url, body) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (response.ok) {
    console.log('Register success!');
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error('Error during registration');
    let errorText = `Error registering: \n ${response.url}: ${response.status} ${response.statusText}`;
    try {
      const error = await response.text();
      if (error) {
        errorText = `${errorText} \n\n ${error}`;
      }
    } catch (err) {
      console.error('Error reading body from request:', err);
    }
    console.error(errorText);
  }
}

const cmds = Object.values(commands);

const commandEndpoint = `https://discord.com/api/v10/applications/${applicationId}/commands`;

await register(commandEndpoint, cmds);
