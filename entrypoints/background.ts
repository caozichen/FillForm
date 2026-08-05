import '../legacy/background.js';

export default defineBackground({
  type: 'module',
  main() {
    // The original FormPilot Nova background module registers its own listeners.
  }
});
