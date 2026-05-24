const { Menu } = require('electron');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const i18n = require('./i18n-manager');

function setupLanguageManager() {
    const { getContentView } = require('./window-manager');
    const contentView = getContentView();
    if (!contentView) {
        logger.warn('setupLanguageManager: contentView indisponivel');
        return;
    }

    const currentSession = configureSpellChecker();
    if (!currentSession) return;

    contentView.webContents.on('context-menu', async (event, params) => {
        const items = [];

        if (params.misspelledWord) {
            const suggestions = params.dictionarySuggestions || [];
            items.push({ label: i18n.t('spellcheck.suggestions'), enabled: false });

            if (suggestions.length === 0) {
                items.push({ label: i18n.t('spellcheck.noSuggestions'), enabled: false });
            } else {
                suggestions.slice(0, 5).forEach(suggestion => {
                    items.push({
                        label: suggestion,
                        click: () => contentView.webContents.replaceMisspelling(suggestion)
                    });
                });
            }

            items.push({ type: 'separator' });
            items.push({
                label: i18n.t('spellcheck.addToDictionary'),
                click: () => currentSession.addWordToSpellCheckerDictionary(params.misspelledWord)
            });
        }

        const selection = (params.selectionText || '').trim();
        if (selection && !/\s/.test(selection) && selection.length <= 50) {
            try {
                const customWords = await currentSession.listWordsInSpellCheckerDictionary();
                if (Array.isArray(customWords) && customWords.includes(selection)) {
                    if (items.length) items.push({ type: 'separator' });
                    items.push({
                        label: i18n.t('spellcheck.removeFromDictionary'),
                        click: () => currentSession.removeWordFromSpellCheckerDictionary(selection)
                    });
                }
            } catch (err) {
                logger.warn('Falha ao listar dicionario custom: {}', err.message);
            }
        }

        if (items.length === 0) return;

        const mainWindow = globalStore.get('mainWindow');
        const menu = Menu.buildFromTemplate(items);
        if (mainWindow && !mainWindow.isDestroyed()) {
            menu.popup({ window: mainWindow });
        } else {
            menu.popup();
        }
    });
}

function configureSpellChecker() {
    const currentSession = globalStore.get('session');
    if (!currentSession) {
        logger.error('Session nao inicializada. SpellChecker nao configurado.');
        return null;
    }
    currentSession.setSpellCheckerLanguages(['en-US', 'pt-BR']);
    return currentSession;
}

module.exports = {
    setupLanguageManager
};
