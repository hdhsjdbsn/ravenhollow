'use strict';
// Items: base types, magic affixes, uniques, generation, names and tooltips.

const SLOTS = ['head', 'body', 'main', 'off', 'hands', 'feet', 'neck', 'ring1', 'ring2'];
const SLOT_NAMES = { head: 'Head', body: 'Body', main: 'Weapon', off: 'Lantern', hands: 'Hands', feet: 'Feet', neck: 'Amulet', ring1: 'Ring', ring2: 'Ring' };

// kind: weapon|shield|helm|armor|gloves|boots|ring|amulet|potion|scroll|tome|gold|quest
// model: visual id (weapon model kind / armor style / helm style)
const BASES = {
  // ---- weapons ---- dmg, speed (attacks per second multiplier), req, lvl (min item level), price
  dagger: { name: 'Dagger', kind: 'weapon', model: 'dagger', dmg: [2, 4], spd: 1.25, req: { dex: 0 }, lvl: 1, price: 40, hands: 1, mat: 'steel' },
  shortSword: { name: 'Short Sword', kind: 'weapon', model: 'sword', dmg: [2, 6], spd: 1.1, req: { str: 18 }, lvl: 1, price: 90, hands: 1, mat: 'steel' },
  club: { name: 'Spiked Club', kind: 'weapon', model: 'club', dmg: [3, 6], spd: 1.0, req: { str: 15 }, lvl: 1, price: 60, hands: 1 },
  handAxe: { name: 'Hand Axe', kind: 'weapon', model: 'axe', dmg: [3, 7], spd: 1.0, req: { str: 22 }, lvl: 2, price: 110, hands: 1, mat: 'iron' },
  mace: { name: 'Flanged Mace', kind: 'weapon', model: 'mace', dmg: [4, 9], spd: 0.95, req: { str: 30 }, lvl: 4, price: 220, hands: 1, mat: 'iron' },
  longSword: { name: 'Long Sword', kind: 'weapon', model: 'sword', dmg: [5, 11], spd: 1.05, req: { str: 30, dex: 20 }, lvl: 5, price: 300, hands: 1, mat: 'steel' },
  warAxe: { name: 'Bearded Axe', kind: 'weapon', model: 'axe', dmg: [6, 14], spd: 0.95, req: { str: 38 }, lvl: 8, price: 480, hands: 1, mat: 'blackSteel' },
  falchion: { name: 'Falchion', kind: 'weapon', model: 'sword', dmg: [8, 16], spd: 1.05, req: { str: 45, dex: 30 }, lvl: 12, price: 900, hands: 1, mat: 'silver' },
  morningStar: { name: 'Morning Star', kind: 'weapon', model: 'mace', dmg: [10, 20], spd: 0.95, req: { str: 55 }, lvl: 16, price: 1400, hands: 1, mat: 'blackSteel' },
  runeBlade: { name: 'Rune Blade', kind: 'weapon', model: 'sword', dmg: [13, 25], spd: 1.1, req: { str: 65, dex: 45 }, lvl: 22, price: 2600, hands: 1, mat: 'crimsonSteel' },
  greatSword: { name: 'Great Sword', kind: 'weapon', model: 'greatsword', dmg: [9, 20], spd: 0.85, req: { str: 45 }, lvl: 6, price: 600, hands: 2, mat: 'steel' },
  battleAxe: { name: 'Battle Axe', kind: 'weapon', model: 'battleaxe', dmg: [12, 26], spd: 0.8, req: { str: 60 }, lvl: 10, price: 1100, hands: 2, mat: 'iron' },
  maul: { name: 'Maul', kind: 'weapon', model: 'maul', dmg: [15, 32], spd: 0.75, req: { str: 75 }, lvl: 14, price: 1600, hands: 2, mat: 'iron' },
  executioner: { name: "Executioner's Blade", kind: 'weapon', model: 'greatsword', dmg: [22, 44], spd: 0.85, req: { str: 95, dex: 50 }, lvl: 22, price: 3500, hands: 2, mat: 'blackSteel' },
  // ---- lanterns (the Penitent's off-hand: a little armour, a chance to ward off blows, light and fire) ----
  tallowLantern: { name: 'Tallow Lantern', kind: 'lantern', model: 'lantern1', armor: [2, 4], block: 10, light: 10, spell: 5, req: {}, lvl: 1, price: 50 },
  ironLantern: { name: 'Iron Lantern', kind: 'lantern', model: 'lantern2', armor: [5, 8], block: 15, light: 20, spell: 10, req: { str: 25 }, lvl: 4, price: 220 },
  gildedLantern: { name: 'Gilded Reliquary', kind: 'lantern', model: 'lantern3', armor: [9, 14], block: 20, light: 30, spell: 20, req: { str: 35, mag: 25 }, lvl: 10, price: 900 },
  hellLantern: { name: 'Pyre Cage', kind: 'lantern', model: 'lantern4', armor: [14, 22], block: 25, light: 40, spell: 35, req: { str: 50, mag: 40 }, lvl: 17, price: 2200 },
  // ---- helms ----
  cap: { name: 'Leather Cap', kind: 'helm', model: 'cap', armor: [1, 3], req: {}, lvl: 1, price: 30 },
  coif: { name: 'Mail Coif', kind: 'helm', model: 'coif', armor: [3, 6], req: { str: 20 }, lvl: 3, price: 120 },
  helm: { name: 'Nasal Helm', kind: 'helm', model: 'helm', armor: [5, 9], req: { str: 30 }, lvl: 6, price: 300 },
  greatHelm: { name: 'Great Helm', kind: 'helm', model: 'greathelm', armor: [9, 14], req: { str: 50 }, lvl: 12, price: 900 },
  hornedHelm: { name: 'Horned Helm', kind: 'helm', model: 'horned', armor: [12, 18], req: { str: 60 }, lvl: 17, price: 1500 },
  circlet: { name: 'Circlet', kind: 'helm', model: 'circlet', armor: [2, 5], req: { mag: 25 }, lvl: 5, price: 400 },
  crown: { name: 'Crown', kind: 'helm', model: 'crown', armor: [8, 14], req: { str: 30, mag: 40 }, lvl: 16, price: 2000 },
  // ---- body armour ----
  rags: { name: 'Penitent Rags', kind: 'armor', model: 'tunic', armor: [2, 4], req: {}, lvl: 1, price: 20, tunic: 'clothBrown' },
  quiltedArmor: { name: 'Quilted Armor', kind: 'armor', model: 'tunic', armor: [5, 8], req: {}, lvl: 1, price: 80, tunic: 'clothDark' },
  leatherArmor: { name: 'Leather Armor', kind: 'armor', model: 'leather', armor: [9, 14], req: { str: 20 }, lvl: 3, price: 250 },
  robe: { name: 'Apprentice Robe', kind: 'armor', model: 'robe', armor: [4, 7], req: { mag: 15 }, lvl: 1, price: 120, robeCol: 'clothBlue' },
  mageRobe: { name: 'Magus Robe', kind: 'armor', model: 'robe', armor: [10, 16], req: { mag: 45 }, lvl: 9, price: 900, robeCol: 'clothPurple' },
  chainMail: { name: 'Chain Mail', kind: 'armor', model: 'chain', armor: [16, 24], req: { str: 35 }, lvl: 6, price: 650 },
  scaleMail: { name: 'Scale Mail', kind: 'armor', model: 'chain', armor: [22, 32], req: { str: 45 }, lvl: 10, price: 1100 },
  plateMail: { name: 'Plate Mail', kind: 'armor', model: 'plate', armor: [32, 45], req: { str: 60 }, lvl: 14, price: 2200 },
  gothicPlate: { name: 'Gothic Plate', kind: 'armor', model: 'plate', armor: [45, 60], req: { str: 80 }, lvl: 20, price: 4000, metal: 'blackSteel' },
  // ---- gloves / boots ----
  leatherGloves: { name: 'Leather Gloves', kind: 'gloves', armor: [1, 3], req: {}, lvl: 1, price: 30 },
  gauntlets: { name: 'Gauntlets', kind: 'gloves', armor: [4, 7], req: { str: 40 }, lvl: 9, price: 450 },
  leatherBoots: { name: 'Leather Boots', kind: 'boots', armor: [1, 3], req: {}, lvl: 1, price: 30 },
  greaves: { name: 'Greaves', kind: 'boots', armor: [4, 7], req: { str: 40 }, lvl: 9, price: 450 },
  // ---- jewellery ----
  ring: { name: 'Ring', kind: 'ring', req: {}, lvl: 3, price: 500 },
  amulet: { name: 'Amulet', kind: 'amulet', req: {}, lvl: 6, price: 800 },
  // ---- consumables ----
  potHeal: { name: 'Potion of Healing', kind: 'potion', effect: 'heal', amount: 0.35, lvl: 1, price: 50, stack: 20 },
  potMana: { name: 'Potion of Mana', kind: 'potion', effect: 'mana', amount: 0.35, lvl: 1, price: 50, stack: 20 },
  potFullHeal: { name: 'Potion of Full Healing', kind: 'potion', effect: 'heal', amount: 1.0, lvl: 8, price: 150, stack: 20 },
  potFullMana: { name: 'Potion of Full Mana', kind: 'potion', effect: 'mana', amount: 1.0, lvl: 8, price: 150, stack: 20 },
  potRejuv: { name: 'Rejuvenation Elixir', kind: 'potion', effect: 'both', amount: 0.5, lvl: 5, price: 250, stack: 20 },
  scrollTP: { name: 'Scroll of Town Portal', kind: 'scroll', effect: 'portal', lvl: 1, price: 75, stack: 20 },
  scrollID: { name: 'Scroll of Identify', kind: 'scroll', effect: 'identify', lvl: 1, price: 60, stack: 20 },
  elixirStr: { name: 'Elixir of Strength', kind: 'potion', effect: 'str', lvl: 6, price: 2500, stack: 5 },
  elixirDex: { name: 'Elixir of Dexterity', kind: 'potion', effect: 'dex', lvl: 6, price: 2500, stack: 5 },
  elixirMag: { name: 'Elixir of Magic', kind: 'potion', effect: 'mag', lvl: 6, price: 2500, stack: 5 },
  elixirVit: { name: 'Elixir of Vitality', kind: 'potion', effect: 'vit', lvl: 6, price: 2500, stack: 5 },
  tome: { name: 'Tome', kind: 'tome', lvl: 2, price: 800 },
  gold: { name: 'Gold', kind: 'gold', lvl: 1, price: 1 },
};

// ---- affixes: [name, stat, min, max, minLevel, kinds] ----
const KW = ['weapon'], KA = ['armor', 'helm', 'lantern', 'gloves', 'boots'], KJ = ['ring', 'amulet'], ANY = ['weapon', 'armor', 'helm', 'lantern', 'gloves', 'boots', 'ring', 'amulet'];
const PREFIXES = [
  ['Jagged', 'edmg', 20, 35, 1, KW], ['Deadly', 'edmg', 36, 50, 5, KW], ['Vicious', 'edmg', 51, 70, 9, KW], ['Brutal', 'edmg', 71, 100, 14, KW], ['Merciless', 'edmg', 101, 140, 20, KW],
  ['Fine', 'tohit', 6, 15, 1, KW.concat(KJ, ['gloves'])], ['Masterwork', 'tohit', 16, 30, 7, KW.concat(KJ, ['gloves'])], ['Champion\'s', 'tohit', 31, 50, 15, KW.concat(KJ, ['gloves'])],
  ['Sturdy', 'earmor', 20, 35, 1, KA], ['Blessed', 'earmor', 36, 55, 6, KA], ['Saintly', 'earmor', 56, 80, 12, KA], ['Holy', 'earmor', 81, 110, 18, KA],
  ['Red', 'resFire', 10, 20, 1, KA.concat(KJ)], ['Crimson', 'resFire', 21, 35, 8, KA.concat(KJ)], ['Ruby', 'resFire', 36, 50, 15, KA.concat(KJ)],
  ['Blue', 'resLight', 10, 20, 1, KA.concat(KJ)], ['Azure', 'resLight', 21, 35, 8, KA.concat(KJ)], ['Sapphire', 'resLight', 36, 50, 15, KA.concat(KJ)],
  ['Pale', 'resCold', 10, 20, 1, KA.concat(KJ)], ['Frosted', 'resCold', 21, 35, 8, KA.concat(KJ)], ['Crystal', 'resCold', 36, 50, 15, KA.concat(KJ)],
  ['Topaz', 'resAll', 8, 15, 6, KA.concat(KJ)], ['Obsidian', 'resAll', 16, 30, 16, KA.concat(KJ)],
  ['Jackal\'s', 'life', 5, 10, 1, ANY], ['Fox\'s', 'life', 11, 20, 4, ANY], ['Wolf\'s', 'life', 21, 35, 9, ANY], ['Lion\'s', 'life', 36, 55, 15, ANY], ['Mammoth\'s', 'life', 56, 80, 21, ANY],
  ['Hyena\'s', 'mana', 5, 10, 1, ANY], ['Raven\'s', 'mana', 11, 20, 4, ANY], ['Serpent\'s', 'mana', 21, 35, 9, ANY], ['Drake\'s', 'mana', 36, 55, 15, ANY], ['Wyrm\'s', 'mana', 56, 80, 21, ANY],
  ['Flaming', 'fireDmg', 3, 8, 4, KW], ['Searing', 'fireDmg', 9, 18, 12, KW], ['Shocking', 'lightDmg', 1, 12, 5, KW], ['Thundering', 'lightDmg', 3, 28, 13, KW], ['Freezing', 'coldDmg', 2, 7, 5, KW], ['Glacial', 'coldDmg', 6, 16, 13, KW],
  ['Arcane', 'skills', 1, 1, 12, ['amulet', 'helm', 'weapon']],
];
const SUFFIXES = [
  ['of Strength', 'str', 2, 5, 1, ANY], ['of Might', 'str', 6, 10, 6, ANY], ['of Giants', 'str', 11, 18, 14, ANY], ['of Titans', 'str', 19, 28, 21, ANY],
  ['of Dexterity', 'dex', 2, 5, 1, ANY], ['of Skill', 'dex', 6, 10, 6, ANY], ['of Precision', 'dex', 11, 18, 14, ANY], ['of Perfection', 'dex', 19, 28, 21, ANY],
  ['of Magic', 'mag', 2, 5, 1, ANY], ['of the Mind', 'mag', 6, 10, 6, ANY], ['of Sorcery', 'mag', 11, 18, 14, ANY], ['of Wizardry', 'mag', 19, 28, 21, ANY],
  ['of Vitality', 'vit', 2, 5, 1, ANY], ['of Zest', 'vit', 6, 10, 6, ANY], ['of Vigor', 'vit', 11, 18, 14, ANY], ['of Life', 'vit', 19, 28, 21, ANY],
  ['of the Moon', 'allStats', 2, 4, 6, KJ.concat(['helm'])], ['of the Stars', 'allStats', 5, 8, 14, KJ.concat(['helm'])], ['of the Heavens', 'allStats', 9, 14, 22, KJ],
  ['of Leeching', 'lifeSteal', 3, 5, 3, KW.concat(KJ)], ['of the Vampire', 'lifeSteal', 6, 9, 12, KW.concat(KJ)],
  ['of the Bat', 'manaSteal', 3, 5, 3, KW.concat(KJ)], ['of Wraiths', 'manaSteal', 6, 9, 12, KW.concat(KJ)],
  ['of Haste', 'ias', 10, 20, 4, KW.concat(['gloves'])], ['of Swiftness', 'ias', 21, 30, 12, KW.concat(['gloves'])],
  ['of the Lamp', 'light', 15, 25, 1, KA.concat(KJ)], ['of Radiance', 'light', 26, 40, 8, KA.concat(KJ)],
  ['of Thorns', 'thorns', 2, 6, 3, ['armor', 'lantern']], ['of Spikes', 'thorns', 7, 15, 12, ['armor', 'lantern']],
  ['of Regeneration', 'regen', 1, 3, 4, KA.concat(KJ)], ['of Renewal', 'regen', 4, 8, 14, KA.concat(KJ)],
  ['of Speed', 'speed', 8, 15, 5, ['boots']], ['of the Wind', 'speed', 16, 25, 14, ['boots']],
  ['of Readiness', 'fcr', 10, 20, 5, ['weapon', 'amulet', 'ring', 'helm']],
  ['of Deflection', 'block', 5, 10, 4, ['lantern']],
  ['of Embers', 'spell', 10, 25, 3, ['lantern', 'amulet', 'helm']], ['of the Pyre', 'spell', 26, 45, 13, ['lantern', 'amulet']],
  ['of Wealth', 'gold', 20, 50, 1, KA.concat(KJ)], ['of Fortune', 'magicFind', 10, 25, 6, KA.concat(KJ)],
];

const STAT_TEXT = {
  edmg: v => `+${v}% Enhanced Damage`, tohit: v => `+${v} to Hit`, earmor: v => `+${v}% Enhanced Armor`,
  resFire: v => `Fire Resist +${v}%`, resLight: v => `Lightning Resist +${v}%`, resCold: v => `Cold Resist +${v}%`, resAll: v => `All Resistances +${v}%`,
  life: v => `+${v} to Life`, mana: v => `+${v} to Mana`, fireDmg: v => `Adds ${v}-${v * 2} Fire Damage`, lightDmg: v => `Adds 1-${v * 2} Lightning Damage`, coldDmg: v => `Adds ${v}-${Math.round(v * 1.6)} Cold Damage`,
  str: v => `+${v} to Strength`, dex: v => `+${v} to Dexterity`, mag: v => `+${v} to Magic`, vit: v => `+${v} to Vitality`, allStats: v => `+${v} to All Attributes`,
  lifeSteal: v => `${v}% Life Stolen per Hit`, manaSteal: v => `${v}% Mana Stolen per Hit`, ias: v => `+${v}% Attack Speed`, light: v => `+${v}% Light Radius`,
  thorns: v => `Attacker Takes ${v} Damage`, regen: v => `Regenerate ${v} Life per Second`, speed: v => `+${v}% Movement Speed`, fcr: v => `+${v}% Casting Speed`,
  block: v => `+${v}% Chance to Ward`, spell: v => `+${v}% Fire Spell Damage`, gold: v => `+${v}% Extra Gold from Monsters`, magicFind: v => `+${v}% Better Chance of Magic Items`, skills: v => `+${v} to All Skills`,
  armorFlat: v => `+${v} Defense`, dmgFlat: v => `+${v} Damage`, crit: v => `${v}% Chance of Crushing Blow`, dmgDemons: v => `+${v}% Damage to Demons`, dmgUndead: v => `+${v}% Damage to Undead`,
};

const UNIQUES = [
  { id: 'gravecaller', base: 'shortSword', name: 'Gravecaller', lvl: 3, stats: { edmg: 60, dmgUndead: 50, life: 10, light: 20 }, lore: 'Forged from a sexton\'s spade.' },
  { id: 'thornheart', base: 'tallowLantern', name: 'Thornheart', lvl: 3, stats: { earmor: 80, thorns: 6, block: 10 } , lore: 'It bites back.' },
  { id: 'abbotsHood', base: 'cap', name: 'The Abbot\'s Shame', lvl: 4, stats: { mag: 10, mana: 20, resAll: 10, light: -20 }, lore: 'Worn by the one who opened the seal.' },
  { id: 'flayersCleaver', base: 'handAxe', name: 'The Flayer\'s Cleaver', lvl: 4, stats: { edmg: 120, lifeSteal: 6, str: 8, tohit: -10 }, lore: 'Still warm.' },
  { id: 'wolfsong', base: 'longSword', name: 'Wolfsong', lvl: 5, stats: { edmg: 70, dex: 10, ias: 20, coldDmg: 4 }, lore: 'The string hums at night.' },
  { id: 'ashenwand', base: 'dagger', name: 'Ashwillow', lvl: 6, stats: { mag: 15, skills: 1, mana: 25, fcr: 20 }, lore: 'Cut from a tree that grew in a pyre.' },
  { id: 'kingsCirclet', base: 'circlet', name: 'Circlet of the Buried Bishop', lvl: 8, stats: { allStats: 6, skills: 1, life: 25, resCold: 30 }, lore: 'It remembers a heavier head.' },
  { id: 'boneweave', base: 'chainMail', name: 'Boneweave Hauberk', lvl: 8, stats: { earmor: 120, vit: 12, resAll: 15, thorns: 5 }, lore: 'Each link is a knuckle.' },
  { id: 'marrowmaul', base: 'maul', name: 'Marrowmaul', lvl: 12, stats: { edmg: 160, crit: 15, str: 15, dmgUndead: 80 }, lore: 'Built for breaking what will not stay down.' },
  { id: 'widowsKiss', base: 'falchion', name: 'Widow\'s Kiss', lvl: 11, stats: { edmg: 110, dex: 18, lifeSteal: 5, fireDmg: 8 }, lore: 'Spun from the Mother\'s own silk.' },
  { id: 'saintsMantle', base: 'mageRobe', name: 'Mantle of the Drowned Saint', lvl: 13, stats: { mag: 25, mana: 60, fcr: 25, resFire: 40, regen: 4 }, lore: 'Water still drips from the hem.' },
  { id: 'ravenmark', base: 'amulet', name: 'The Ravenmark', lvl: 10, stats: { skills: 1, allStats: 8, light: 30, magicFind: 25 }, lore: 'The ravens of Ravenhollow watch over its bearer.' },
  { id: 'emberRing', base: 'ring', name: 'Ember of the Deep', lvl: 12, stats: { fireDmg: 10, resFire: 30, str: 10, mag: 10 }, lore: 'It never cools.' },
  { id: 'oathkeeper', base: 'falchion', name: 'Oathkeeper', lvl: 15, stats: { edmg: 150, dmgDemons: 100, allStats: 10, lifeSteal: 7 }, lore: 'Sworn against the Abyss.' },
  { id: 'hellforged', base: 'plateMail', name: 'Hellforged Plate', lvl: 18, stats: { earmor: 150, life: 60, resFire: 50, thorns: 15, speed: -5 }, lore: 'Quenched in the Burning Abyss.' },
  { id: 'starfall', base: 'gildedLantern', name: 'Starfall', lvl: 18, stats: { skills: 2, mag: 30, mana: 80, fcr: 30, spell: 40 }, lore: 'A piece of the sky, caged in gold.' },
  { id: 'nightstride', base: 'leatherBoots', name: 'Nightstride', lvl: 7, stats: { speed: 25, dex: 10, resCold: 20 }, lore: 'Leaves no footprints in ash.' },
  { id: 'gripOfTheDeep', base: 'gauntlets', name: 'Grip of the Deep', lvl: 14, stats: { str: 15, ias: 20, lifeSteal: 4, earmor: 80 }, lore: '' },
];

let ITEM_ID = 1;
function rollRange(R, a, b) { return Math.round(a + (b - a) * R()); }

function makeItem(baseId, opts = {}) {
  const B = BASES[baseId];
  const it = { id: ITEM_ID++, base: baseId, kind: B.kind, rarity: 0, ilvl: opts.ilvl || B.lvl || 1, stats: {}, identified: true, qty: opts.qty || 1 };
  const R = opts.rng || rand;
  if (B.dmg) it.dmg = [B.dmg[0], B.dmg[1]];
  if (B.armor) it.armor = rollRange(R, B.armor[0], B.armor[1]);
  if (B.kind === 'tome') it.skill = opts.skill;
  if (B.kind === 'gold') it.qty = opts.qty || 10;
  return it;
}

function pickAffix(list, kind, ilvl, R) {
  const opts = list.filter(a => a[5].includes(kind) && a[4] <= ilvl);
  if (!opts.length) return null;
  // favour affixes near the item level
  return R.weighted ? R.weighted(opts, a => 1 + a[4] / 4) : opts[Math.floor(R() * opts.length)];
}

// Generate a random item of a given item level.
function randomItem(ilvl, R = rand, opts = {}) {
  const mf = opts.magicFind || 0;
  // consumables vs equipment
  if (!opts.equipOnly) {
    const r = R();
    if (r < 0.28) {
      const pots = ['potHeal', 'potMana', 'potHeal', 'potMana', 'potHeal', 'scrollTP', 'scrollID'];
      if (ilvl >= 5) pots.push('potRejuv'); if (ilvl >= 8) pots.push('potFullHeal', 'potFullMana');
      if (ilvl >= 6 && R() < 0.04) pots.push('elixirStr', 'elixirDex', 'elixirMag', 'elixirVit');
      return makeItem(R.pick(pots), { ilvl });
    }
  }
  const equip = Object.keys(BASES).filter(k => { const b = BASES[k]; return ['weapon', 'lantern', 'helm', 'armor', 'gloves', 'boots', 'ring', 'amulet'].includes(b.kind) && b.lvl <= ilvl + 2 && b.lvl >= ilvl - 14; });
  const baseId = R.weighted(equip, k => (BASES[k].kind === 'ring' || BASES[k].kind === 'amulet') ? 0.5 : 1 + BASES[k].lvl / (ilvl + 2));
  const it = makeItem(baseId, { ilvl, rng: R });
  // rarity
  const uChance = 0.012 * (1 + mf / 100) + (opts.boss ? 0.15 : 0);
  const mChance = (0.22 + Math.min(0.2, ilvl * 0.01)) * (1 + mf / 100) + (opts.boss ? 0.5 : 0) + (opts.champion ? 0.3 : 0);
  const jew = it.kind === 'ring' || it.kind === 'amulet';
  if (R() < uChance) {
    const us = UNIQUES.filter(u => u.lvl <= ilvl + 3 && (!opts.uniqueKind || BASES[u.base].kind === opts.uniqueKind));
    if (us.length) return makeUnique(R.pick(us), ilvl);
  }
  if (jew || R() < mChance) {
    it.rarity = 1;
    const two = R() < 0.4 || jew;
    let pre = R() < 0.6 || !two ? pickAffix(PREFIXES, it.kind, ilvl, R) : null;
    let suf = (!pre || two) ? pickAffix(SUFFIXES, it.kind, ilvl, R) : null;
    if (!pre && !suf) suf = pickAffix(SUFFIXES, it.kind, ilvl, R);
    if (pre) { it.prefix = pre[0]; it.stats[pre[1]] = (it.stats[pre[1]] || 0) + rollRange(R, pre[2], pre[3]); }
    if (suf) { it.suffix = suf[0]; it.stats[suf[1]] = (it.stats[suf[1]] || 0) + rollRange(R, suf[2], suf[3]); }
    it.identified = R() < 0.25;
  }
  return it;
}

function makeUnique(u, ilvl) {
  const it = makeItem(u.base, { ilvl: Math.max(ilvl, u.lvl) });
  it.rarity = 3; it.unique = u.id; it.uname = u.name; it.stats = Object.assign({}, u.stats); it.identified = false; it.lore = u.lore;
  return it;
}

function itemName(it, full = true) {
  const B = BASES[it.base];
  if (it.kind === 'gold') return `${fmtNum(it.qty)} Gold`;
  if (it.kind === 'tome') return `Tome of ${SKILLS[it.skill] ? SKILLS[it.skill].name : 'Lore'}`;
  if (it.rarity === 3) return it.identified ? it.uname : B.name;
  if (it.rarity === 1 && it.identified) return [it.prefix, B.name, it.suffix].filter(Boolean).join(' ');
  return B.name;
}
function itemColor(it) {
  if (it.kind === 'gold') return '#e8c860';
  if (it.kind === 'tome') return '#e09040';
  return it.rarity === 3 ? 'var(--unique)' : it.rarity === 1 ? 'var(--magic)' : (it.kind === 'potion' || it.kind === 'scroll') ? '#c8c0b0' : '#e0d8c8';
}
function itemValue(it) {
  const B = BASES[it.base];
  if (it.kind === 'gold') return it.qty;
  let v = B.price;
  if (it.kind === 'tome') v = 800 + (SKILLS[it.skill] ? SKILLS[it.skill].reqLevel * 60 : 0);
  if (it.rarity === 1) { let p = 0; for (const k in it.stats) p += Math.abs(it.stats[k]); v = v * 1.5 + p * 25 + it.ilvl * 30; }
  if (it.rarity === 3) v = v * 3 + 1500 + it.ilvl * 100;
  return Math.max(1, Math.round(v));
}
function sellValue(it) { return Math.max(1, Math.floor(itemValue(it) * (it.identified ? 0.25 : 0.12) * (it.qty || 1))); }

// lines for tooltips: [{text, color}]
function itemTooltip(it, hero) {
  const B = BASES[it.base], L = [];
  L.push({ text: itemName(it), color: itemColor(it), big: true });
  if (it.rarity === 3 && it.identified) L.push({ text: B.name, color: 'var(--unique)' });
  if (it.kind === 'weapon') {
    let [a, b] = it.dmg; const ed = it.stats.edmg || 0;
    if (it.identified && ed) { a = Math.round(a * (1 + ed / 100)); b = Math.round(b * (1 + ed / 100)); }
    L.push({ text: `${B.hands === 2 ? 'Two-Hand' : 'One-Hand'} Damage: ${a} to ${b}`, color: ed && it.identified ? 'var(--magic)' : null });
    L.push({ text: `Speed: ${B.spd >= 1.1 ? 'Fast' : B.spd >= 0.95 ? 'Normal' : 'Slow'}`, color: 'var(--muted)' });
  }
  if (it.armor) { let ar = it.armor; if (it.identified && it.stats.earmor) ar = Math.round(ar * (1 + it.stats.earmor / 100)); L.push({ text: `Defense: ${ar}`, color: it.stats.earmor && it.identified ? 'var(--magic)' : null }); }
  if (B.block) L.push({ text: `Chance to Ward: ${B.block + (it.identified ? (it.stats.block || 0) : 0)}%` });
  if (B.light) L.push({ text: `Light Radius +${B.light}%  ·  Fire Spells +${B.spell}%`, color: 'var(--muted)' });
  if (B.kind === 'potion') L.push({ text: B.effect === 'heal' ? `Restores ${Math.round(B.amount * 100)}% Life` : B.effect === 'mana' ? `Restores ${Math.round(B.amount * 100)}% ${G.settings.lantern !== false ? 'Lantern Fire' : 'Mana'}` : B.effect === 'both' ? `Restores ${Math.round(B.amount * 100)}% Life and Mana` : `Permanently +1 ${({ str: 'Strength', dex: 'Dexterity', mag: 'Magic', vit: 'Vitality' })[B.effect]}`, color: 'var(--muted)' });
  if (B.kind === 'scroll') L.push({ text: B.effect === 'portal' ? 'Opens a portal back to Ravenhollow' : 'Reveals the powers of a magic item', color: 'var(--muted)' });
  if (it.kind === 'tome') {
    L.push({ text: 'Read to learn or improve this skill', color: 'var(--muted)' });
    const rq = SKILLS[it.skill] ? SKILLS[it.skill].reqLevel : 0, lv = typeof WORLD !== 'undefined' && WORLD.hero ? WORLD.hero.lvl : 99;
    if (rq > 1) L.push({ text: `Requires level ${rq}` + (lv < rq ? ` (you are level ${lv})` : ''), color: lv < rq ? '#ff5040' : 'var(--muted)' });
  }
  if (it.qty > 1 && it.kind !== 'gold') L.push({ text: `Quantity: ${it.qty}`, color: 'var(--muted)' });
  // requirements
  const req = B.req || {};
  for (const k of ['str', 'dex', 'mag']) if (req[k]) {
    const ok = !hero || hero.attr(k) >= req[k];
    L.push({ text: `Required ${({ str: 'Strength', dex: 'Dexterity', mag: 'Magic' })[k]}: ${req[k]}`, color: ok ? null : '#e04030' });
  }
  if (!it.identified && it.rarity > 0) L.push({ text: 'Unidentified', color: '#e04030' });
  else for (const k in it.stats) { if (k === 'edmg' && it.kind === 'weapon') { L.push({ text: STAT_TEXT[k](it.stats[k]), color: 'var(--magic)' }); continue; } if (k === 'earmor' && it.armor) { L.push({ text: STAT_TEXT[k](it.stats[k]), color: 'var(--magic)' }); continue; } const f = STAT_TEXT[k]; if (f) L.push({ text: f(it.stats[k]), color: 'var(--magic)' }); }
  if (it.lore && it.identified) L.push({ text: it.lore, color: '#a08860', italic: true });
  return L;
}

function canEquip(hero, it) {
  const B = BASES[it.base]; const req = B.req || {};
  for (const k in req) if (hero.attr(k) < req[k]) return false;
  return true;
}
function slotsFor(it) {
  switch (it.kind) {
    case 'weapon': return ['main']; case 'lantern': return ['off']; case 'helm': return ['head']; case 'armor': return ['body'];
    case 'gloves': return ['hands']; case 'boots': return ['feet']; case 'amulet': return ['neck']; case 'ring': return ['ring1', 'ring2'];
  }
  return [];
}

// ---- baked item views: ground sprites (set items_g) and inventory icons (icons atlas) ----
const ITEM_VIEW = {
  dagger: 'dagger', shortSword: 'sword', club: 'club', handAxe: 'axe', mace: 'mace', longSword: 'longsword', warAxe: 'axe', falchion: 'sword', morningStar: 'mace', runeBlade: 'runeblade',
  greatSword: 'greatsword', battleAxe: 'battleaxe', maul: 'maul', executioner: 'greatsword',
  tallowLantern: 'lantern1', ironLantern: 'lantern2', gildedLantern: 'lantern3', hellLantern: 'lantern4',
  cap: 'cap', coif: 'coif', helm: 'helm', greatHelm: 'greathelm', hornedHelm: 'horned', circlet: 'circlet', crown: 'crown',
  rags: 'tunic', quiltedArmor: 'tunic', leatherArmor: 'leather', robe: 'robe', mageRobe: 'robe', chainMail: 'chain', scaleMail: 'chain', plateMail: 'plate', gothicPlate: 'plate',
  leatherGloves: 'gloves', gauntlets: 'gauntlets', leatherBoots: 'boots', greaves: 'greaves', ring: 'ring', amulet: 'amulet',
  potHeal: 'potRed', potMana: 'potBlue', potFullHeal: 'potRedBig', potFullMana: 'potBlueBig', potRejuv: 'potPurple',
  elixirStr: 'elixirStr', elixirDex: 'elixirDex', elixirMag: 'elixirMag', elixirVit: 'elixirVit', scrollTP: 'scrollTP', scrollID: 'scrollID', tome: 'tome', gold: 'gold',
};
const itemView = it => ITEM_VIEW[it.base] || 'crate';
const ICON_CACHE = {};
let ICON_IMG = null;
function loadIcons() {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { ICON_IMG = im; res(); }; im.onerror = () => rej(new Error('icons')); im.src = ASSET_BASE + 'icons.webp'; });
}
function itemIcon(it) {
  const key = it.base + (it.rarity === 3 ? 'u' : it.rarity === 1 ? 'm' : '');
  if (ICON_CACHE[key]) return ICON_CACHE[key];
  const r = window.ICONS && ICONS.r[itemView(it)];
  const px = window.ICONS && ICONS.px;                       // sprite atlas: drawn 1:1, hard pixels
  const S = px ? 144 : 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  if (px) x.imageSmoothingEnabled = false;
  if (r && ICON_IMG) {
    const k = px ? Math.min(1.7, S * 0.86 / Math.max(r[2], r[3])) : Math.min(1.25, (S - 10) / Math.max(r[2], r[3]));
    const w = r[2] * k, h = r[3] * k;
    if (it.rarity > 0) { x.shadowColor = it.rarity === 3 ? 'rgba(220,170,60,0.55)' : 'rgba(110,140,255,0.45)'; x.shadowBlur = 10; }
    x.drawImage(ICON_IMG, r[0], r[1], r[2], r[3], Math.round((S - w) / 2), Math.round((S - h) / 2), w, h);
  }
  return (ICON_CACHE[key] = cv.toDataURL());
}
