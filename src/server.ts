import { Hono } from 'hono';
import {
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from 'discord-interactions';
import * as commands from './commands.js';
import * as discordJs from 'discord-api-types/v10';
import { Bindings } from './worker-configuration.js';


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

async function createChannel(guildId: string, name: string, parentId: string, topic: string, token: string) {
  return fetch(`${discordApi}/guilds/${guildId}/channels`, {
    method: 'POST',
    headers:
      {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
    body: JSON.stringify({
      name,
      topic: topic,
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

          // Use this as the single source of truth for all permission calculations
          const CATEGORY_ALLOW_INT = 517543939136;
          const VIEW_CHANNEL = 1024;
          const SEND_MESSAGES = 2048;
          const USE_APPLICATION_COMMANDS = 2147483648;

          if (
            interaction.member &&
            interaction.member.roles.includes('1346386480788017163')
          ) {
            const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
            const interactionOptions = interactionData.options!;
            const courseCode = getValueByKey(interactionOptions, "course_code") as string;
            const courseName = getValueByKey(interactionOptions, "course_name") as string;

            if (courseCode && courseName) {
              // Create a new role for the course (no permissions)
              const guildId = interaction.guild_id!;
              const roleRes = await fetch(`${discordApi}/guilds/${guildId}/roles`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: `${courseCode.toUpperCase()}`,
                  mentionable: true,
                  hoist: false,
                  permissions: "0"
                }),
              });

              if (!roleRes.ok) {
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `Failed to create role for course ${courseCode}.`,
                    flags: InteractionResponseFlags.EPHEMERAL,
                  },
                });
              }

              const role = await roleRes.json() as { id: string };
              const roleId = role.id;

              await c.env.DISCORD_DATA.put(
                `course_${courseCode.toUpperCase()}`,
                JSON.stringify({ roleId, courseName })
              );

              // Use the hardcoded integer for all permission calculations
              const categoryAllowInt = CATEGORY_ALLOW_INT;
              const categoryAllow = categoryAllowInt.toString();
              const categoryOverwrites = [
                {
                  id: guildId, // @everyone
                  type: 0,
                  deny: VIEW_CHANNEL.toString(), // VIEW_CHANNEL
                },
                {
                  id: roleId,
                  type: 0,
                  allow: categoryAllow,
                },
              ];

              // Create category locked to the role
              const categoryRes = await fetch(`${discordApi}/guilds/${guildId}/channels`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: `${courseCode.toUpperCase()} — ${courseName}`,
                  type: 4, // Category
                  permission_overwrites: categoryOverwrites,
                }),
              });

              if (!categoryRes.ok) {
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `Course ${courseCode} configured, but failed to create category.`,
                    flags: InteractionResponseFlags.EPHEMERAL,
                  },
                });
              }

              const category = await categoryRes.json() as { id: string };
              const categoryId = category.id;

              // Announcements channel: allow same as category minus SEND_MESSAGES and USE_APPLICATION_COMMANDS for the role, and explicitly deny those two
              const announcementsAllowInt = categoryAllowInt & ~SEND_MESSAGES & ~USE_APPLICATION_COMMANDS;
              const announcementsAllow = announcementsAllowInt.toString();
              const announcementsDenyInt = SEND_MESSAGES | USE_APPLICATION_COMMANDS;
              const announcementsDeny = announcementsDenyInt.toString();
              const announcementsOverwrites = [
                {
                  id: guildId, // @everyone
                  type: 0,
                  deny: VIEW_CHANNEL.toString(),
                },
                {
                  id: roleId,
                  type: 0,
                  allow: announcementsAllow,
                  deny: announcementsDeny,
                },
              ];

              const announcementsRes = await fetch(`${discordApi}/guilds/${guildId}/channels`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: `${courseCode.toUpperCase()}-announcements`,
                  type: 0, // Text channel
                  parent_id: categoryId,
                  topic: `Announcements for ${courseCode.toUpperCase()} - ${courseName}`,
                  permission_overwrites: announcementsOverwrites,
                }),
              });

              // General channel (discussion): inherit from category
              const generalRes = await fetch(`${discordApi}/guilds/${guildId}/channels`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: `${courseCode.toUpperCase()}-general`,
                  type: 0, // Text channel
                  parent_id: categoryId,
                  topic: `General discussion for ${courseCode.toUpperCase()} - ${courseName}`,
                }),
              });

              if (announcementsRes.ok && generalRes.ok) {
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `Course ${courseCode} configured; recorded in database, with role and associated category/channels created successfully.`,
                  },
                });
              } else {
                return c.json({
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  data: {
                    content: `Course ${courseCode} configured and role created, but failed to create one or more channels.`,
                  },
                });
              }
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
            const courseData = await c.env.DISCORD_DATA.get(
              `course_${courseCode.toUpperCase()}`
            );
            if (courseData) {
              const { roleId } = JSON.parse(courseData);
              // Check if user already has the role
              const memberRes = await fetch(`${discordApi}/guilds/${interaction.guild_id}/members/${interaction.member!.user.id}`, {
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              });
              if (memberRes.ok) {
                const member = await memberRes.json() as { roles: string[] };
                if (member.roles && member.roles.includes(roleId)) {
                  return c.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                      content: `You already have the role for course ${courseCode}.`,
                      flags: InteractionResponseFlags.EPHEMERAL,
                    },
                  });
                }
              }
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
            }
          }
          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Course ${courseCode} not found.`,
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }

        case commands.LEAVE_COMMAND.name.toLowerCase(): {
          const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
          const courseCode = getValueByKey(interactionData.options!, "course_code") as string;

          if (courseCode) {
            const courseData = await c.env.DISCORD_DATA.get(
              `course_${courseCode.toUpperCase()}`
            );
            if (courseData) {
              const { roleId } = JSON.parse(courseData);
              // Check if user has the role before removing
              const memberRes = await fetch(`${discordApi}/guilds/${interaction.guild_id}/members/${interaction.member!.user.id}`, {
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              });
              if (memberRes.ok) {
                const member = await memberRes.json() as { roles: string[] };
                if (!member.roles || !member.roles.includes(roleId)) {
                  return c.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                      content: `You do not have the role for course ${courseCode}.`,
                      flags: InteractionResponseFlags.EPHEMERAL,
                    },
                  });
                }
              }
              await fetch(`${discordApi}/guilds/${interaction.guild_id}/members/${interaction.member!.user.id}/roles/${roleId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              });
              return c.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `You have been removed from the role for course ${courseCode}.`,
                  allowed_mentions: {
                    roles: [roleId],
                  },
                },
              });
            }
          }
          return c.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Course ${courseCode} not found.`,
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

        case commands.GENERATE_COMMAND.name.toLowerCase(): {
          if (!interaction.member ||
          !interaction.member.roles.includes('1340543049716990054')) {
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
                permission_overwrites: [
                  {
                    id: getValueByKey(interactionData.options!, "role_id"),
                    type: 0,
                    allow: 515396455488,
                    deny: 0,
                  },
                  {
                    id: guildId,
                    type: 0,
                    allow: 0,
                    deny: 515396455488,
                  },
                ],
                type: 4,
              }),
            });

            if (category.ok) {
              const categoryData = await category.json() as { id: string };
              const categoryId = categoryData.id;
              const channels = await Promise.all([
                createChannel(guildId, `${name}-core`, categoryId, "For the core portion of the assignment", c.env.DISCORD_TOKEN),
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
      // Returns autocomplete for focused field of the join/leave command
      const interactionData = interaction.data as discordJs.APIChatInputApplicationCommandInteractionData;
      const commandName = interactionData.name.toLowerCase();
      const options = interactionData.options!;
      // Autocomplete for join command
      if (commandName === commands.JOIN_COMMAND.name.toLowerCase()) {
        const courseCode = options.find((opt) => opt.name === 'course_code') as discordJs.APIApplicationCommandInteractionDataStringOption;
        if (courseCode && courseCode.focused) {
          const courses = await c.env.DISCORD_DATA.list({ prefix: 'course_' });
          const courseOptions = courses.keys
            .map((course) => course.name.split('_')[1])
            .filter((course) => course.startsWith(courseCode.value.toUpperCase()))
            .map((course) => ({ name: course, value: course }));
          return c.json({
            type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
            data: {
              choices: courseOptions,
            },
          });
        }
      }
      // Autocomplete for leave command (removing roles)
      if (commandName === commands.LEAVE_COMMAND.name.toLowerCase()) {
        const courseCode = options.find((opt) => opt.name === 'course_code') as discordJs.APIApplicationCommandInteractionDataStringOption;
        if (courseCode && courseCode.focused) {
          const courses = await c.env.DISCORD_DATA.list({ prefix: 'course_' });
          // Fetch member roles
          const memberRes = await fetch(`${discordApi}/guilds/${interaction.guild_id}/members/${interaction.member!.user.id}`, {
            headers: {
              'Authorization': `Bot ${c.env.DISCORD_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });
          let userRoles: string[] = [];
          if (memberRes.ok) {
            const member = await memberRes.json() as { roles: string[] };
            userRoles = member.roles || [];
          }
          // For each course, fetch its value and check if user has the role
          const filteredCourses: { name: string, value: string }[] = [];
          for (const course of courses.keys) {
            const code = course.name.split('_')[1];
            if (!code.startsWith(courseCode.value.toUpperCase())) continue;
            const value = await c.env.DISCORD_DATA.get(course.name);
            if (!value) continue;
            try {
              const { roleId } = JSON.parse(value);
              if (userRoles.includes(roleId)) {
                filteredCourses.push({ name: code, value: code });
              }
            } catch {}
          }
          return c.json({
            type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
            data: {
              choices: filteredCourses,
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
