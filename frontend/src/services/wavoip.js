const Wavoip = require("wavoip-api");

class WavoipService {
    constructor() {
        this.wavoip = new Wavoip();
        this.instance = null;
    }

    async connect() {
        if (!this.instance) {
            this.instance = this.wavoip.connect(process.env.REACT_APP_WAVOIP_TOKEN);
            
            this.instance.socket.on('connect', () => {
                console.log('Wavoip connected successfully');
            });

            this.instance.socket.on('error', (error) => {
                console.error('Wavoip connection error:', error);
            });
        }
        return this.instance;
    }

    async initiateCall(phoneNumber) {
        const instance = await this.connect();
        return instance.callStart({
            whatsappid: phoneNumber
        });
    }

    async endCall(callId) {
        const instance = await this.connect();
        return instance.callEnd({
            callId: callId
        });
    }
}

export default new WavoipService();