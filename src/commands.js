/**
 * Share commands metadata from a common spot to be used for both runtime
 * and registration.
 */

import { ApplicationCommandOptionType } from 'discord-api-types/v10';

export const REVIVE_COMMAND = {
  name: 'revive',
  description:
    'Revival ping command, executable by members of the Promotions Team',
};

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

export const LOOKUP_COMMAND = {
  name: 'lookup',
  description: 'Get detailed information on a standard!',
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      type: ApplicationCommandOptionType.Integer,
      name: 'standard_number',
      description: 'Standard number to look up information for.',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.Integer,
      name: 'exam_year',
      description:
        '(If external) Year to link paper for - if unspecified defaults to paper from two years ago.',
    },
  ],
};
