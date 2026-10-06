export const CHARACTERS = Object.freeze([
  { id: 0, name: 'Люми', color: 0xffdc55, voiceLabel: 'Певучий' },
  { id: 1, name: 'Бубо', color: 0xa87bff, voiceLabel: 'Низкий' },
  { id: 2, name: 'Зип', color: 0x83f779, voiceLabel: 'Ритмичный' },
  { id: 3, name: 'Пип', color: 0xff5375, voiceLabel: 'Звонкий' },
  { id: 4, name: 'Вольт', color: 0x46defa, voiceLabel: 'Электронный' },
  { id: 5, name: 'Физзи', color: 0xfa8fe8, voiceLabel: 'Воздушный' },
].map(Object.freeze));

/** Actor 0 is always human; profile selection only changes presentation. */
export function getCharacterOrder(selection) {
  const selected = Number.isInteger(selection) && selection >= 0 && selection < CHARACTERS.length ? selection : 0;
  return [selected, ...CHARACTERS.filter(character => character.id !== selected).map(character => character.id)];
}
