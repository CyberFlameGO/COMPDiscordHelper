/**
 * Share commands metadata from a common spot to be used for both runtime
 * and registration.
 */

import { ApplicationCommandOptionType } from 'discord-api-types/v10';

export const CONFIGURE_COMMAND = {
  name: 'configure',
  description: 'Configure the bot for your server.',
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'course_code',
      description: 'Course code to configure',
      autocomplete: true,
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'role_id',
      description: 'Role ID to assign',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'course_name',
      description: 'Course name for auto-complete',
      required: true,
    },
  ],
};

export const JOIN_COMMAND = {
  name: 'join',
  description: 'Join a course by course code.',
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'course_code',
      description: 'Course code to join',
      required: true,
    },
  ],
};

export const TEST_COMMAND = {
  name: 'test',
  description: 'This command serves no purpose.',
};

export const PING_COMMAND = {
  name: 'ping',
  description: 'Check latency stats of the bot.',
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

export const GENERATE_COMMAND = {
  name: 'generate',
  description: 'Generate a category with 3 text channels.',
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'name',
      description: 'Name for the category and channel name prefix',
      required: true,
    },
  ],
};
