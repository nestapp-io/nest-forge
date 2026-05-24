class GlobalStore {
    constructor() {
        if (!GlobalStore.instance) {
            this.data = {
                appName: process.env.APP_NAME || 'gchat',
                mainWindow: null,
            };
            GlobalStore.instance = this;
        }
        return GlobalStore.instance;
    }

    set(key, value) {
        this.data[key] = value;
    }

    get(key) {
        return this.data[key];
    }

    listAll() {
        return this.data;
    }
}

module.exports = new GlobalStore();
