// Copyright (c) 2025-2026 zkLicensing project developers
// SPDX-License-Identifier: BUSL-1.1
/**
 * seatName.ts
 *
 * Human-readable device names for the ownership-token session list
 * ("Silent Otter", "Curious Panda"). Used by the /respond keeper handler
 * when the client didn't pass a name of its own, so every seat in the
 * per-license device list has something readable next to it.
 *
 * The name is purely cosmetic — the verifier never gates on it, evictLRR
 * doesn't use it, /releaseSeat targets jti not name. Its only job is to
 * let a user look at the device list on their phone and recognise "the
 * laptop I left in the office" without needing to correlate opaque jtis.
 *
 * Uniqueness is per-license and best-effort. The name space is roughly
 * adjectives.length * animals.length ≈ 62,500 combinations, well above
 * the ~50k ceiling of 10k licenses × 5-seat cap. Collisions within a
 * single license are possible but rare — if two seats end up with the
 * same name, the user distinguishes them by mintedAt in the UI. We do
 * not scan the existing seat set to enforce uniqueness because (a) the
 * name is cosmetic and (b) the client can always propose its own.
 *
 * The wordlists are intentionally boring: no scary animals, no negative
 * adjectives, no cultural landmines, no words with awkward secondary
 * meanings. Order and word choice are stable — changing them shifts every
 * seat's name on the next mint, which would be jarring for users looking
 * at their device list.
 */
// 250 friendly adjectives. Short, common, unambiguously positive or
// neutral. Ordering is alphabetical for maintainability — the random
// pick is index-based so order does not affect behavior.
const ADJECTIVES = [
    'Agile', 'Alert', 'Amber', 'Ample', 'Ancient', 'Apricot', 'Arctic', 'Ashen',
    'Aspen', 'Autumn', 'Azure', 'Balmy', 'Bashful', 'Beaming', 'Beige', 'Bold',
    'Bouncy', 'Brave', 'Breezy', 'Bright', 'Brisk', 'Bronze', 'Bubbly', 'Busy',
    'Calm', 'Candid', 'Cedar', 'Cheery', 'Chic', 'Chipper', 'Chunky', 'Classic',
    'Clean', 'Clever', 'Cloudy', 'Clumsy', 'Coastal', 'Comet', 'Cool', 'Copper',
    'Coral', 'Cosmic', 'Cosy', 'Crafty', 'Creamy', 'Crimson', 'Crisp', 'Cuddly',
    'Curious', 'Daisy', 'Dandy', 'Dapper', 'Daring', 'Dawn', 'Deft', 'Delta',
    'Devout', 'Dewy', 'Diamond', 'Doughty', 'Dreamy', 'Dusky', 'Dusty', 'Eager',
    'Earnest', 'Earthy', 'Easy', 'Ebony', 'Elder', 'Elm', 'Ember', 'Emerald',
    'Epic', 'Fabled', 'Faint', 'Fair', 'Fancy', 'Fearless', 'Feisty', 'Fern',
    'Fiery', 'Fine', 'Firm', 'Flaxen', 'Fleet', 'Floral', 'Fluffy', 'Foggy',
    'Fond', 'Forest', 'Frank', 'Freckled', 'Friendly', 'Frosty', 'Frugal', 'Furry',
    'Fuzzy', 'Gallant', 'Genial', 'Gentle', 'Gilded', 'Ginger', 'Glad', 'Glassy',
    'Gleaming', 'Glossy', 'Glowing', 'Golden', 'Graceful', 'Grand', 'Grassy',
    'Green', 'Handy', 'Happy', 'Hardy', 'Hazel', 'Hearty', 'Helpful', 'Honest',
    'Humble', 'Icy', 'Indigo', 'Inky', 'Iron', 'Ivory', 'Jade', 'Jaunty', 'Jazzy',
    'Jolly', 'Jovial', 'Joyful', 'Juniper', 'Keen', 'Kind', 'Lanky', 'Lark',
    'Lavender', 'Lazy', 'Leaf', 'Lilac', 'Limber', 'Lively', 'Lofty', 'Loyal',
    'Lucky', 'Lush', 'Marble', 'Matte', 'Meadow', 'Mellow', 'Merry', 'Mighty',
    'Milky', 'Mindful', 'Minty', 'Misty', 'Modest', 'Mossy', 'Nautical', 'Nectar',
    'Nifty', 'Nimble', 'Noble', 'Nutmeg', 'Oaken', 'Ochre', 'Olive', 'Onyx',
    'Opal', 'Orange', 'Orchid', 'Pale', 'Patient', 'Peachy', 'Pearl', 'Pebble',
    'Perky', 'Piney', 'Placid', 'Playful', 'Plucky', 'Plum', 'Plush', 'Polar',
    'Polite', 'Prairie', 'Proud', 'Prudent', 'Punchy', 'Purple', 'Quaint', 'Quick',
    'Quiet', 'Radiant', 'Rainy', 'Rapid', 'Rare', 'Ready', 'Ripe', 'River',
    'Rocky', 'Rosy', 'Royal', 'Ruby', 'Rugged', 'Rustic', 'Saffron', 'Sage',
    'Sandy', 'Sapphire', 'Scarlet', 'Serene', 'Shady', 'Sharp', 'Shy', 'Silent',
    'Silken', 'Silky', 'Silver', 'Sincere', 'Sleek', 'Sleepy', 'Slender', 'Small',
    'Smart', 'Smiling', 'Snowy', 'Solar', 'Solid', 'Sonic', 'Soulful', 'Speedy',
    'Spirited', 'Splendid', 'Sprightly', 'Spry', 'Starry', 'Steady', 'Stellar',
    'Sterling', 'Stormy', 'Stout', 'Sunny', 'Sunset', 'Swift', 'Tangy', 'Teal',
    'Tender', 'Thankful', 'Thoughtful', 'Thrifty', 'Tidy', 'Timber', 'Tiny',
    'Topaz', 'Tranquil', 'Trusty', 'Turquoise', 'Twilight', 'Upright', 'Valiant',
    'Velvet', 'Verdant', 'Violet', 'Vivid', 'Warm', 'Whimsical', 'Willow',
    'Windy', 'Winsome', 'Wise', 'Witty', 'Woodland', 'Woolly', 'Zealous', 'Zesty',
];
// 250 friendly animals. Common, recognisable, unambiguously non-threatening
// (no predators-of-humans, no venomous ones, no polarising taxidermy). Two-
// word species (mountain goat, sea otter) are collapsed to the base name so
// the final "Adjective Animal" reads cleanly. Ordering is alphabetical.
const ANIMALS = [
    'Alpaca', 'Anteater', 'Antelope', 'Ape', 'Armadillo', 'Auk', 'Aurochs',
    'Axolotl', 'Baboon', 'Badger', 'Barnacle', 'Bat', 'Beagle', 'Bear', 'Beaver',
    'Bee', 'Beetle', 'Bison', 'Blackbird', 'Bluebird', 'Boar', 'Bobcat', 'Bonobo',
    'Booby', 'Buffalo', 'Bulldog', 'Bullfinch', 'Bumblebee', 'Butterfly', 'Camel',
    'Capybara', 'Cardinal', 'Caribou', 'Cassowary', 'Cat', 'Caterpillar',
    'Catfish', 'Chameleon', 'Chamois', 'Cheetah', 'Chickadee', 'Chinchilla',
    'Chipmunk', 'Clam', 'Clownfish', 'Coati', 'Cobra', 'Cockatoo', 'Codfish',
    'Colt', 'Condor', 'Coot', 'Cormorant', 'Corgi', 'Cougar', 'Cow', 'Coyote',
    'Crab', 'Crane', 'Cricket', 'Crow', 'Cub', 'Cuckoo', 'Curlew', 'Deer',
    'Dingo', 'Dolphin', 'Donkey', 'Dormouse', 'Dove', 'Dragonfly', 'Drake',
    'Duck', 'Duckling', 'Eagle', 'Echidna', 'Eel', 'Egret', 'Elephant', 'Elk',
    'Emu', 'Falcon', 'Fawn', 'Ferret', 'Finch', 'Firefly', 'Fish', 'Flamingo',
    'Fox', 'Frog', 'Gecko', 'Gerbil', 'Gibbon', 'Giraffe', 'Gnu', 'Goat',
    'Godwit', 'Goldfinch', 'Goldfish', 'Goose', 'Gorilla', 'Grebe', 'Griffon',
    'Grouse', 'Guanaco', 'Guineafowl', 'Gull', 'Guppy', 'Hamster', 'Hare',
    'Harrier', 'Hawk', 'Hedgehog', 'Heron', 'Herring', 'Hippo', 'Hoatzin',
    'Hoopoe', 'Hornbill', 'Horse', 'Hound', 'Hummingbird', 'Ibex', 'Ibis',
    'Iguana', 'Impala', 'Jackal', 'Jackrabbit', 'Jaguar', 'Jay', 'Jellyfish',
    'Kakapo', 'Kangaroo', 'Kestrel', 'Kingfisher', 'Kinkajou', 'Kite', 'Kitten',
    'Kiwi', 'Koala', 'Kookaburra', 'Ladybug', 'Lamb', 'Lapwing', 'Lark',
    'Lemming', 'Lemur', 'Leopard', 'Lion', 'Lizard', 'Llama', 'Lobster',
    'Lorikeet', 'Loris', 'Lynx', 'Macaque', 'Macaw', 'Magpie', 'Mallard',
    'Manatee', 'Mandrill', 'Mantis', 'Marmoset', 'Marmot', 'Marten', 'Meerkat',
    'Mink', 'Minnow', 'Mole', 'Mongoose', 'Monkey', 'Moose', 'Moth', 'Mouse',
    'Mule', 'Muntjac', 'Muskrat', 'Narwhal', 'Newt', 'Nightingale', 'Numbat',
    'Nuthatch', 'Ocelot', 'Octopus', 'Okapi', 'Opossum', 'Orangutan', 'Oriole',
    'Ostrich', 'Otter', 'Owl', 'Ox', 'Oyster', 'Panda', 'Pangolin', 'Panther',
    'Parakeet', 'Parrot', 'Partridge', 'Peacock', 'Pelican', 'Penguin', 'Perch',
    'Pheasant', 'Pig', 'Pigeon', 'Piglet', 'Pika', 'Pipit', 'Platypus', 'Plover',
    'Pointer', 'Polecat', 'Pony', 'Porcupine', 'Porpoise', 'Possum', 'Prawn',
    'Ptarmigan', 'Puffin', 'Puma', 'Pup', 'Puppy', 'Quail', 'Quokka', 'Rabbit',
    'Raccoon', 'Ram', 'Rat', 'Raven', 'Reindeer', 'Rhino', 'Roadrunner', 'Robin',
    'Rook', 'Salamander', 'Salmon', 'Sandpiper', 'Sardine', 'Scallop', 'Seahorse',
    'Seal', 'Serval', 'Shrew', 'Shrimp', 'Skunk', 'Sloth', 'Snail', 'Snake',
    'Snipe', 'Sparrow', 'Spider', 'Squid', 'Squirrel', 'Starling', 'Stoat',
    'Stork', 'Sturgeon', 'Swallow', 'Swan', 'Tamarin', 'Tanager', 'Tapir',
    'Tarsier', 'Teal', 'Tern', 'Terrier', 'Thrush', 'Tiger', 'Toad', 'Toucan',
    'Trout', 'Tuna', 'Turkey', 'Turtle', 'Vole', 'Wagtail', 'Walrus', 'Wapiti',
    'Warbler', 'Wasp', 'Weasel', 'Whale', 'Whippet', 'Wolf', 'Wolverine',
    'Wombat', 'Woodchuck', 'Woodpecker', 'Wren', 'Yak', 'Zebra',
];
// Total combinations = ADJECTIVES.length * ANIMALS.length. Exposed for
// diagnostics and for tests that want to assert the name space is large
// enough to cover the expected ceiling of licenses × cap.
export const SEAT_NAME_COMBINATIONS = ADJECTIVES.length * ANIMALS.length;
// Draw a random "Adjective Animal" from the wordlists. The optional `rng`
// parameter accepts an injected number-in-[0,1) generator (Math.random by
// default) so tests can pin the output — production callers pass nothing
// and get non-deterministic names.
//
// The random pick is deliberately uniform and independent per component;
// we do NOT scan the existing seat set to enforce per-license uniqueness
// (see file header for the rationale). Callers that need uniqueness must
// filter externally.
export function randomSeatName(rng = Math.random) {
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(rng() * ANIMALS.length)];
    return `${adj} ${animal}`;
}
//# sourceMappingURL=seatName.js.map