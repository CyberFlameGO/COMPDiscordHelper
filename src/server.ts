import { Hono } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import {
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import * as commands from './commands.js';
import * as discordJs from 'discord-api-types/v10';
import { Bindings } from './worker-configuration.js';


const router = new Hono<{ Bindings: Bindings }>();

// eslint-disable-next-line no-unused-vars
router.post('/interactions', async (c) => {
  const signature = c.req.header('x-signature-ed25519')!;
  const timestamp = c.req.header('x-signature-timestamp')!;
  const body = await c.req.text();
  if (!(await verifyKey(body, signature as string, timestamp, c.env.DISCORD_PUBLIC_KEY)))
   return new Response('Invalid request', { status: 401 });
  const interaction: discordJs.APIInteraction =
    (await c.req.json()) as discordJs.APIInteraction;

  switch (interaction.type) {
    case discordJs.InteractionType.Ping: {
      // The `PING` message is used during the initial webhook handshake, and is
      // required to configure the webhook in the developer portal.
      return c.json({ type: InteractionResponseType.PONG });
    }

    case discordJs.InteractionType.ApplicationCommand: {
      // Most user commands will come as `APPLICATION_COMMAND`.
      switch (interaction.data.name.toLowerCase()) {
        // Revive ping command - checks if a user has a role and pings a role if they do
        case commands.REVIVE_COMMAND.name.toLowerCase(): {
          if (
            interaction.member &&
            interaction.member.roles.includes('909724765026148402')
          ) {
            console.log('handling revive request');
            return c.json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  "Hey there <@&879527848573042738> squad, it's time to make the chat active!",
                allowed_mentions: {
                  roles: ['879527848573042738'],
                },
              },
            });
          }
          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                'You do not have the correct role necessary to perform this action. If you believe this is an error, please contact CyberFlame United#0001 (<@218977195375329281>).',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }

        case commands.CONFIGURE_COMMAND.name.toLowerCase(): {
          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'This command is not yet implemented.',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }

        // Ping command - for checking latency of the bot, returned as a non-ephemeral message
        case commands.PING_COMMAND.name.toLowerCase(): {
          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Pong! Latency: ${
                Date.now() -
                Math.round(Number(interaction.id) / 4194304 + 1420070400000)
              }ms (rounded to nearest integer)`,
            },
          });
        }
        default:
          return c.json({ error: 'Unknown Type' }, { status: 400 });
      }
    }
  }

  console.error('Unknown Type');
  return c.json({ error: 'Unknown Type' }, { status: 400 });
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

export default router;
