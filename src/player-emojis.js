// A seat keeps its badge through nickname changes, reconnects and rematches.
// The supplied set has 18 symbols; two pairs give all 20 seats distinct badges.
export const PLAYER_EMOJIS=Object.freeze(['💩','😎','😂','🤡','👺','👽','😈','🐷','🔥','🌈','🌪','🌚','🇷🇺','🗿','🌟','🐳','🐸','💀','😎🔥','🌈🌟']);
export const playerEmoji=id=>Number.isInteger(id)&&id>=0&&id<PLAYER_EMOJIS.length?PLAYER_EMOJIS[id]:'';
