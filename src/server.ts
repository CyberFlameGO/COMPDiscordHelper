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
import { val } from 'cheerio/dist/commonjs/api/attributes.js';


const router = new Hono<{ Bindings: Bindings }>();
const discordApi = 'https://discord.com/api/v10';

function getValueByKey(options: discordJs.APIApplicationCommandInteractionDataOption[], key: string) {
  const value = options.find((opt) => opt.name === key);
  if (value) {
    if ('value' in value) {
      return value.value as string | number;
    }
  }
  return null;
}

async function createChannel(guildId: string, name: string, parentId: string, token: string) {
  return fetch(`${discordApi}/guilds/${guildId}/channels`, {
    method: 'POST',
    headers:
      {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
    body: JSON.stringify({
      name,
      type: 0,
      parent_id: parentId,
    }),
  })
}

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

        case commands.CONFIGURE_COMMAND.name.toLowerCase(): {
          if (
            interaction.member &&
            interaction.member.roles.includes('1287260363556917330')
          ) {
            const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
            const interactionOptions = interactionData.options!;
            const courseCode = getValueByKey(interactionOptions, "course_code") as string;
            const roleId = getValueByKey(interactionOptions, "role_id");
            const courseName = getValueByKey(interactionOptions, "course_name");

            if (courseCode && roleId && courseName) {
              await c.env.DISCORD_DATA.put(
                `course_${courseCode.toUpperCase()}`,
                JSON.stringify({ roleId, courseName })
              );
              return c.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `Course ${courseCode} configured successfully.`,
                  flags: InteractionResponseFlags.EPHEMERAL,
                },
              });
            }
          }
          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                'You do not have the correct role necessary to perform this action. If you believe this is an error, please contact the administrator.',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }

        case commands.JOIN_COMMAND.name.toLowerCase(): {
          const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
          const courseCode = getValueByKey(interactionData.options!, "course_code") as string;
        
          if (courseCode) {
            c.executionCtx.waitUntil((async () => {
              const courseData = await c.env.DISCORD_DATA.get(
                `course_${courseCode.toUpperCase()}`
              );
              if (courseData) {
                const { roleId } = JSON.parse(courseData);
                await fetch(`${discordApi}/guilds/${interaction.guild_id}/members/${interaction.member!.user.id}/roles/${roleId}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                });
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `You have been assigned the role for course ${courseCode}.`,
                    allowed_mentions: {
                      roles: [roleId],
                    },
                  },
                });
              } else {
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `Course ${courseCode} not found.`,
                    flags: InteractionResponseFlags.EPHEMERAL,
                  },
                });
              }
            })());
            return c.json({
              type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            });
          } else {
            return c.json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `Course code is required.`,
                flags: InteractionResponseFlags.EPHEMERAL,
              },
            });
          }
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

        case commands.GENERATE_COMMAND.name.toLowerCase(): {
          if (!interaction.member ||
          !interaction.member.roles.includes('1287260363556917330')) {
            return c.json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'You do not have the correct role necessary to perform this action. If you believe this is an error, please contact the administrator.',
                flags: InteractionResponseFlags.EPHEMERAL,
              },
            });
          }

          const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
          const name = getValueByKey(interactionData.options!, "name");

          if (name) {
            const guildId = interaction.guild_id!;
            const category = await fetch(`${discordApi}/guilds/${guildId}/channels`, {
              method: 'POST',
              headers: {
                'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name,
                type: 4,
              }),
            });

            if (category.ok) {
              const categoryData = await category.json() as { id: string };
              const categoryId = categoryData.id;
              const channels = await Promise.all([
                createChannel(guildId, `${name}-core`, categoryId, c.env.DISCORD_TOKEN),
                createChannel(guildId, `${name}-completion`, categoryId, c.env.DISCORD_TOKEN),
                createChannel(guildId, `${name}-challenge`, categoryId, c.env.DISCORD_TOKEN),
              ]);

              if (channels.every((channel) => channel.ok)) {
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `Category ${name} with channels ${name}-1, ${name}-2, and ${name}-3 created successfully.`,
                    flags: InteractionResponseFlags.EPHEMERAL,
                  },
                });
              }
            }


            return c.json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `Category ${name} with channels ${name}-1, ${name}-2, and ${name}-3 created successfully.`,
                flags: InteractionResponseFlags.EPHEMERAL,
              },
            });
          }

          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Failed to create category and channels.',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }

        default:
          return c.json({ error: 'Unknown Type' }, { status: 400 });
      }
    }

    case discordJs.InteractionType.ApplicationCommandAutocomplete: {
      // Returns autocomplete for focused field of the join command
      const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
      const commandName = interactionData.name.toLowerCase();
      const options = interactionData.options!;
      // Check if the parameter is course_code in the join command
      if (commandName === commands.JOIN_COMMAND.name.toLowerCase()) {
        // Get course code as a full object instead of just the value
        const courseCode = options.find((opt) => opt.name === 'course_code') as discordJs.APIApplicationCommandInteractionDataStringOption;
        if (courseCode && courseCode.focused) {
          const courses = await c.env.DISCORD_DATA.list({ prefix: 'course_' });
          // Get the course codes from the list of courses, from what the user has entered so far via .value
          const courseOptions = courses.keys
          .map((course) => course.name.split('_')[1])
          .filter((course) => course.startsWith(courseCode.value))
          .map((course) => ({ name: course, value: course }));
          
          return c.json({
            type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
            data: {
              choices: courseOptions,
            },
          });
        }
      }

    }
  }

  console.error('Unknown Type');
  return c.json({ error: 'Unknown Type' }, { status: 400 });
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

export default router;
