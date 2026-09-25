/**
 * Random nicknames for anonymous raters: a walking mood plus a creature you
 * might meet on a Sofia sidewalk (or up on Vitosha). Assigned once per
 * browser and shown on the leaderboard; the user can shuffle theirs.
 */
const ADJECTIVES = [
  "Brisk", "Curious", "Muddy", "Rainy", "Sunny", "Sleepy", "Speedy", "Tireless",
  "Wandering", "Zigzag", "Puddle", "Cobbled", "Windy", "Foggy", "Frosty", "Dusty",
  "Early", "Midnight", "Lost", "Stubborn", "Cheerful", "Grumpy", "Patient", "Restless",
  "Steady", "Nimble", "Rolling", "Bumpy", "Breezy", "Snowy", "Golden", "Crooked",
  "Wobbly", "Sturdy", "Soggy", "Shady", "Dawn", "Twilight", "Careful", "Fearless",
  "Quiet", "Loud", "Hungry", "Thirsty", "Lucky", "Wily", "Gentle", "Mighty",
  "Tiny", "Giant", "Swift", "Slow", "Sneaky", "Proud", "Humble", "Jolly",
  "Moody", "Bold", "Shy", "Dizzy", "Glossy", "Fluffy", "Scruffy", "Dapper",
];

const CREATURES = [
  "Pigeon", "Sparrow", "Crow", "Magpie", "Stork", "Swallow", "Blackbird", "Jackdaw",
  "Hedgehog", "Squirrel", "Fox", "Bear", "Lynx", "Marten", "Badger", "Boar",
  "Stray", "Tomcat", "Beetle", "Snail", "Ladybird", "Bumblebee", "Butterfly", "Cricket",
  "Owl", "Falcon", "Hawk", "Woodpecker", "Nightingale", "Cuckoo", "Wren", "Robin",
  "Goat", "Donkey", "Pony", "Hare", "Mole", "Otter", "Frog", "Newt",
  "Tortoise", "Lizard", "Dragonfly", "Moth", "Wasp", "Ant", "Spider", "Earthworm",
  "Deer", "Wolf", "Chamois", "Marmot", "Mouse", "Rat", "Bat", "Weasel",
  "Duck", "Goose", "Swan", "Heron", "Seagull", "Starling", "Finch", "Lark",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomNickname(): string {
  return `${pick(ADJECTIVES)} ${pick(CREATURES)}`;
}

/** How many distinct names randomNickname can produce. */
export const NICKNAME_SPACE = ADJECTIVES.length * CREATURES.length;
