import test from 'node:test';
import assert from 'node:assert/strict';
import {bindTouchControls, suppressControlGestures} from '../src/touch-controls.js';

function emit(target, type, properties = {}) {
 const event = new Event(type, {cancelable: true});
 for (const [name, value] of Object.entries(properties)) {
  Object.defineProperty(event, name, {value, configurable: true});
 }
 target.dispatchEvent(event);
 return event;
}

class Button extends EventTarget {
 constructor() {
  super();
  this.disabled = false;
  this.classes = new Set();
  this.captured = new Set();
  this.released = [];
  this.classList = {
   toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
   contains: name => this.classes.has(name),
  };
 }
 setPointerCapture(id) {
  if (this.captureFails) throw new Error('Pointer capture unavailable');
  this.captured.add(id);
 }
 hasPointerCapture(id) { return this.captured.has(id); }
 releasePointerCapture(id) {
  this.captured.delete(id);
  this.released.push(id);
  emit(this, 'lostpointercapture', {pointerId: id});
 }
}

function pointer(button, type, id, properties = {}) {
 const event = emit(button, type, {
  pointerId: id, pointerType: 'touch', button: 0, isPrimary: false, ...properties,
 });
 if (['pointerup', 'pointercancel', 'lostpointercapture'].includes(type)) {
  button.captured.delete(id);
 }
 return event;
}

function fixture() {
 const buttons = Object.fromEntries(
  ['left', 'right', 'drive', 'jump', 'bomb', 'trap', 'recover'].map(name => [name, new Button()]),
 );
 const releaseTarget = new EventTarget();
 const actions = [];
 let state = {steering: 0, drive: 0};
 const bindings = [
  {button: buttons.left, steering: -1},
  {button: buttons.right, steering: 1},
  {button: buttons.drive, drive: 1},
  ...['jump', 'bomb', 'trap', 'recover'].map(name => ({
   button: buttons[name], onPress: () => actions.push({name, state: {...state}}),
  })),
 ];
 const controls = bindTouchControls(bindings, next => { state = next; }, releaseTarget);
 return {buttons, actions, releaseTarget, controls, state: () => state};
}

test('gas, turn and third-finger actions work before releasing any fingers', () => {
 const f = fixture();
 pointer(f.buttons.drive, 'pointerdown', 1, {isPrimary: true});
 pointer(f.buttons.left, 'pointerdown', 2);
 for (const [index, name] of ['jump', 'bomb', 'trap', 'recover'].entries()) {
  const down = pointer(f.buttons[name], 'pointerdown', index + 3);
  assert.equal(down.defaultPrevented, true);
  assert.equal(f.buttons[name].classList.contains('pressed'), true);
  assert.deepEqual(f.actions.at(-1), {name, state: {steering: -1, drive: 1}});
  assert.equal(f.actions.length, index + 1);
 }
 assert.deepEqual(f.state(), {steering: -1, drive: 1});
 assert.equal(f.buttons.drive.classList.contains('pressed'), true);
 assert.equal(f.buttons.left.classList.contains('pressed'), true);
});

test('deferred physical clicks do not repeat actions after all fingers are released', () => {
 const f = fixture();
 pointer(f.buttons.drive, 'pointerdown', 1, {isPrimary: true});
 pointer(f.buttons.right, 'pointerdown', 2);
 pointer(f.buttons.bomb, 'pointerdown', 3);
 pointer(f.buttons.bomb, 'pointerup', 3);
 assert.equal(f.actions.length, 1);
 assert.deepEqual(f.state(), {steering: 1, drive: 1});
 pointer(f.buttons.right, 'pointerup', 2);
 pointer(f.buttons.drive, 'pointerup', 1);
 for (const properties of [
  {detail: 1, pointerType: 'touch', pointerId: 3, timeStamp: 100_000},
  {detail: 1, timeStamp: 200_000},
  {detail: 2, pointerType: 'mouse'},
  {detail: 0, pointerType: 'touch'},
 ]) {
  assert.equal(emit(f.buttons.bomb, 'click', properties).defaultPrevented, true);
 }
 assert.equal(f.actions.length, 1);
 assert.deepEqual(f.state(), {steering: 0, drive: 0});
});

test('disabled presses and their later clicks remain inactive after re-enabling', () => {
 const f = fixture();
 f.buttons.trap.disabled = true;
 pointer(f.buttons.trap, 'pointerdown', 1);
 assert.equal(f.buttons.trap.classList.contains('pressed'), false);
 assert.equal(f.buttons.trap.captured.size, 0);
 assert.equal(f.actions.length, 0);
 pointer(f.buttons.trap, 'pointerup', 1);
 f.buttons.trap.disabled = false;
 emit(f.buttons.trap, 'click', {detail: 1, pointerType: 'touch'});
 assert.equal(f.actions.length, 0);
 pointer(f.buttons.trap, 'pointerdown', 2);
 assert.equal(f.actions.length, 1);
 f.buttons.trap.disabled = true;
 pointer(f.buttons.trap, 'pointerup', 2);
 assert.equal(f.buttons.trap.classList.contains('pressed'), false);
 emit(f.buttons.trap, 'click', {detail: 0});
 assert.equal(f.actions.length, 1);
 f.buttons.trap.disabled = false;
 emit(f.buttons.trap, 'click', {detail: 1});
 assert.equal(f.actions.length, 1);
 emit(f.buttons.trap, 'click', {detail: 0});
 assert.equal(f.actions.length, 2);
});

test('keyboard, assistive and programmatic activation works while movement is held', () => {
 const f = fixture();
 pointer(f.buttons.drive, 'pointerdown', 1);
 pointer(f.buttons.left, 'pointerdown', 2);
 for (const properties of [{detail: 0}, {detail: 0, pointerType: ''}]) {
  emit(f.buttons.jump, 'click', properties);
  assert.deepEqual(f.actions.at(-1), {name: 'jump', state: {steering: -1, drive: 1}});
 }
 assert.equal(f.actions.length, 2);
 assert.deepEqual(f.state(), {steering: -1, drive: 1});
 assert.equal(f.buttons.jump.classList.contains('pressed'), false);
});

for (const pointerType of ['touch', 'pen', 'mouse']) {
 test(`non-primary ${pointerType} contact acts immediately and the click does not repeat it`, () => {
  const f = fixture();
  pointer(f.buttons.bomb, 'pointerdown', 7, {pointerType, isPrimary: false});
  assert.equal(f.actions.length, 1);
  pointer(f.buttons.bomb, 'pointerup', 7, {pointerType});
  emit(f.buttons.bomb, 'click', {detail: 1, pointerType});
  assert.equal(f.actions.length, 1);
  assert.equal(f.buttons.bomb.classList.contains('pressed'), false);
 });
}

test('non-primary mouse buttons do not activate or become held', () => {
 const f = fixture();
 for (const button of [1, 2]) {
  pointer(f.buttons.bomb, 'pointerdown', button, {pointerType: 'mouse', button});
  pointer(f.buttons.drive, 'pointerdown', button + 10, {pointerType: 'mouse', button});
 }
 assert.equal(f.actions.length, 0);
 assert.deepEqual(f.state(), {steering: 0, drive: 0});
 assert.equal(f.buttons.bomb.classList.contains('pressed'), false);
 assert.equal(f.buttons.drive.classList.contains('pressed'), false);
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
 test(`${type} only releases its own action pointer`, () => {
  const f = fixture();
  pointer(f.buttons.left, 'pointerdown', 1);
  pointer(f.buttons.drive, 'pointerdown', 2);
  pointer(f.buttons.jump, 'pointerdown', 3);
  pointer(f.buttons.jump, type, 3);
  assert.equal(f.buttons.jump.classList.contains('pressed'), false);
  assert.equal(f.actions.length, 1);
  assert.deepEqual(f.state(), {steering: -1, drive: 1});
  assert.equal(f.buttons.left.classList.contains('pressed'), true);
  assert.equal(f.buttons.drive.classList.contains('pressed'), true);
  emit(f.releaseTarget, 'pointercancel', {pointerId: 2});
  assert.deepEqual(f.state(), {steering: -1, drive: 0});
  assert.equal(f.buttons.left.classList.contains('pressed'), true);
 });
}

test('unknown or mismatched local release events do not release another control', () => {
 const f = fixture();
 pointer(f.buttons.drive, 'pointerdown', 1);
 pointer(f.buttons.left, 'pointerdown', 2);
 pointer(f.buttons.bomb, 'pointerup', 1);
 pointer(f.buttons.drive, 'pointercancel', 999);
 pointer(f.buttons.left, 'lostpointercapture', 1);
 assert.deepEqual(f.state(), {steering: -1, drive: 1});
 emit(f.releaseTarget, 'pointerup', {pointerId: 1});
 assert.deepEqual(f.state(), {steering: -1, drive: 0});
 emit(f.releaseTarget, 'pointerup', {pointerId: 999});
 assert.deepEqual(f.state(), {steering: -1, drive: 0});
});

test('a pointer id cannot repeat activation until it is released', () => {
 const f = fixture();
 pointer(f.buttons.bomb, 'pointerdown', 8);
 pointer(f.buttons.bomb, 'pointerdown', 8);
 pointer(f.buttons.jump, 'pointerdown', 8);
 assert.deepEqual(f.actions.map(action => action.name), ['bomb']);
 assert.equal(f.buttons.jump.classList.contains('pressed'), false);
 pointer(f.buttons.bomb, 'pointerup', 8);
 pointer(f.buttons.jump, 'pointerdown', 8);
 assert.deepEqual(f.actions.map(action => action.name), ['bomb', 'jump']);
 pointer(f.buttons.bomb, 'lostpointercapture', 8);
 assert.equal(f.buttons.jump.classList.contains('pressed'), true);
});

test('two fingers on one action keep it pressed until both are released', () => {
 const f = fixture();
 pointer(f.buttons.drive, 'pointerdown', 1);
 pointer(f.buttons.trap, 'pointerdown', 2);
 pointer(f.buttons.trap, 'pointerdown', 3);
 assert.equal(f.actions.length, 2);
 pointer(f.buttons.trap, 'pointerup', 2);
 assert.equal(f.buttons.trap.classList.contains('pressed'), true);
 assert.deepEqual(f.state(), {steering: 0, drive: 1});
 pointer(f.buttons.trap, 'pointercancel', 3);
 assert.equal(f.buttons.trap.classList.contains('pressed'), false);
 assert.deepEqual(f.state(), {steering: 0, drive: 1});
 assert.equal(f.actions.length, 2);
});

test('reset clears captures and pressed controls and ignores stale physical events', () => {
 const f = fixture();
 pointer(f.buttons.drive, 'pointerdown', 1);
 pointer(f.buttons.left, 'pointerdown', 2);
 pointer(f.buttons.bomb, 'pointerdown', 3);
 f.controls.reset();
 assert.deepEqual(f.state(), {steering: 0, drive: 0});
 for (const button of Object.values(f.buttons)) {
  assert.equal(button.classList.contains('pressed'), false);
  assert.equal(button.captured.size, 0);
 }
 assert.deepEqual(f.buttons.drive.released, [1]);
 assert.deepEqual(f.buttons.left.released, [2]);
 assert.deepEqual(f.buttons.bomb.released, [3]);
 pointer(f.buttons.drive, 'pointerup', 1);
 pointer(f.buttons.left, 'pointercancel', 2);
 pointer(f.buttons.bomb, 'lostpointercapture', 3);
 emit(f.buttons.bomb, 'click', {detail: 1, pointerType: 'touch'});
 assert.equal(f.actions.length, 1);
 assert.deepEqual(f.state(), {steering: 0, drive: 0});
 f.controls.reset();
 assert.deepEqual(f.buttons.bomb.released, [3]);
 pointer(f.buttons.bomb, 'pointerdown', 3);
 assert.equal(f.actions.length, 2);
});

test('unavailable pointer capture does not prevent activation or global release', () => {
 const f = fixture();
 f.buttons.bomb.captureFails = true;
 pointer(f.buttons.bomb, 'pointerdown', 1);
 assert.equal(f.actions.length, 1);
 assert.equal(f.buttons.bomb.classList.contains('pressed'), true);
 emit(f.releaseTarget, 'pointerup', {pointerId: 1});
 assert.equal(f.buttons.bomb.classList.contains('pressed'), false);
 f.controls.reset();
});

test('opposite steering and duplicate gas fingers remain independently held', () => {
 const f = fixture();
 pointer(f.buttons.left, 'pointerdown', 1);
 pointer(f.buttons.right, 'pointerdown', 2);
 pointer(f.buttons.drive, 'pointerdown', 3);
 pointer(f.buttons.drive, 'pointerdown', 4);
 assert.deepEqual(f.state(), {steering: 0, drive: 1});
 pointer(f.buttons.right, 'pointerup', 2);
 pointer(f.buttons.drive, 'pointerup', 3);
 assert.deepEqual(f.state(), {steering: -1, drive: 1});
 assert.equal(f.buttons.drive.classList.contains('pressed'), true);
 pointer(f.buttons.drive, 'pointerup', 4);
 assert.deepEqual(f.state(), {steering: -1, drive: 0});
});

test('selection, callout, dragging and double click gestures are blocked on controls', () => {
 const f = fixture();
 for (const button of Object.values(f.buttons)) {
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'dblclick']) {
   assert.equal(emit(button, type).defaultPrevented, true);
  }
 }
 assert.equal(f.actions.length, 0);
 const standalone = new Button();
 suppressControlGestures([standalone]);
 assert.equal(emit(standalone, 'dblclick').defaultPrevented, true);
});
