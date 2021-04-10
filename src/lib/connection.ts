import { PropertyClass, PropertyDataType, ComponentType, DeviceCommand } from "./type";
import * as mqtt from "mqtt";
import { Node, PropertyArgs } from "./node";
import conf from "../config"
import { EventEmitter } from "events"
import { localStorage } from "./storage";

function logger(...args) {
    if (process.env.MODE != "test")
        console.log(...args)
}
interface store {
    apiKey: string;
}

export class Platform extends EventEmitter {
    deviceId: string;
    deviceName: string;
    meta: null | store = null;
    userName: string;
    client: mqtt.MqttClient;
    prefix = "prefix";
    nodes: Node[] = [];
    sensorCnt = -1;

    constructor(deviceId: string, userName: string, deviceName: string) {
        super();
        this.deviceId = deviceId;
        this.userName = userName;
        this.deviceName = deviceName;
        if (localStorage.getItem(deviceId))
            this.meta = JSON.parse(localStorage.getItem(deviceId));
    }

    init = async () => {
        if (!this.isPaired()) return this.connectPairing();
        return this.connect();
    };

    isPaired = () => {
        return this.meta;
    };

    forgot = () => {
        this.meta = null;
        this.prefix = "prefix";
        localStorage.removeItem(this.deviceId);
    };

    connect = () => {
        if (this.meta === null) {
            logger("cant connect without apiKey");
            return;
        }

        this.prefix = `v2/${this.userName}`;

        const client = mqtt.connect(conf.MQTT_SERVER_URL, {
            username: "device=" + this.userName + "/" + this.deviceId,
            password: this.meta.apiKey,
            port: conf.MQTT_SERVER_PORT,
            connectTimeout: 20 * 1000,
            rejectUnauthorized: false,
            will: {
                topic: "v2/" + this.userName + "/" + this.deviceId + "/$state",
                payload: "lost",
                retain: true,
                qos: 1,
            },
        });
        logger("connecting as paired device");
        // client.subscribe("v2/device/" + this.deviceId + "/apiKey");
        client.subscribe(`${this.getDevicePrefix()}/$cmd/set`);

        // setInterval(() => )
        client.publish(`${this.getDevicePrefix()}/$state`, "ready");
        this.client = client;

        this.nodes.forEach(({ nodeId, properties }) => {
            properties.forEach(({ propertyId, settable }) => {
                if (settable)
                    client.subscribe(`${this.getDevicePrefix()}/${nodeId}/${propertyId}/set`);
            })
        });

        client.on("message", (topic, data) => {
            const message = data.toString()
            logger("message", topic, message)
            if (topic === `${this.getDevicePrefix()}/$cmd/set`) {
                if (message === DeviceCommand.restart) {
                    logger("Reseting...")
                    client.end();
                    this.connect();
                } else if (message === DeviceCommand.reset) {
                    logger("Restarting...")
                    client.end();
                    this.forgot();
                    this.connectPairing();
                }
            } else if (topic.startsWith(this.getDevicePrefix())) {
                this.nodes.forEach(({ nodeId, properties }) => {
                    properties.forEach((property) => {
                        const { propertyId, settable, callback } = property
                        if (`${this.getDevicePrefix()}/${nodeId}/${propertyId}/set` === topic && settable) {
                            property.value = message;
                            if (callback) callback(property);
                            client.publish(`${this.getDevicePrefix()}/${nodeId}/${propertyId}`, message);
                        }
                    })
                });
            }
            else this.emit(topic.replace(this.getDevicePrefix(), ""), message);
        });
        client.on("error", (err: any) => {
            if (err.code === 4) {
                // Invalid login
                logger("Invalid userName/password, forgeting apiKey");
                client.end();
                this.forgot();
                this.connectPairing();
            } else logger("error2", err)
        });
        client.on("connect", () => {
            this.emit("connect", client);
        })
    };

    addNode = (nodeId: string, name: string, componentType: ComponentType) => {
        const node = new Node({ nodeId, name, componentType });
        this.nodes.push(node);
        return node;
    };

    addSensor = (args: PropertyArgs) => {
        const node = this.addNode(
            "sensor" + ++this.sensorCnt,
            args.name,
            ComponentType.sensor
        );
        node.addProperty(args);
    };

    sendReady = () => {
        this.client.publish(
            "v2/" + this.userName + "/" + this.deviceId + "/$state",
            "ready"
        );
    };

    getDevicePrefix = () => `${this.prefix}/${this.deviceId}`;

    connectPairing = async () => {
        const client = mqtt.connect(conf.MQTT_SERVER_URL, {
            username: "guest=" + this.deviceId,
            password: "guest",
            port: conf.MQTT_SERVER_PORT,
            connectTimeout: 20 * 1000,
            rejectUnauthorized: false,
            will: {
                topic: `${this.getDevicePrefix()}/$state`,
                payload: "lost",
                retain: true,
                qos: 1,
            },
        });
        client.on("error", function (err) {
            logger("error", err)
        })

        client.on("connect", () => {

        })

        logger("connecting as guest to", conf.MQTT_SERVER_URL);
        client.publish(`${this.getDevicePrefix()}/$state`, "init");
        client.subscribe(`${this.getDevicePrefix()}/$config/apiKey/set`);
        client.subscribe(`${this.getDevicePrefix()}/$cmd/set`);

        client.publish(`${this.getDevicePrefix()}/$name`, this.deviceName);
        client.publish(`${this.getDevicePrefix()}/$realm`, this.userName);
        client.publish(
            `${this.getDevicePrefix()}/$nodes`,
            this.nodes.map((node) => node.nodeId).join()
        );

        this.nodes.forEach(
            ({ nodeId, properties, componentType, name }) => {
                client.publish(
                    `${this.getDevicePrefix()}/${nodeId}/$name`,
                    name
                );
                client.publish(
                    `${this.getDevicePrefix()}/${nodeId}/$type`,
                    componentType
                );
                client.publish(
                    `${this.getDevicePrefix()}/${nodeId}/$properties`,
                    properties.map((prop) => prop.propertyId).join()
                );
                properties.forEach(
                    ({
                        name,
                        propertyClass,
                        unitOfMeasurement,
                        propertyId,
                        dataType,
                        format,
                        settable,
                    }) => {
                        if (name)
                            client.publish(
                                `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$name`,
                                name
                            );
                        if (unitOfMeasurement)
                            client.publish(
                                `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$unit`,
                                unitOfMeasurement
                            );
                        if (dataType)
                            client.publish(
                                `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$datatype`,
                                dataType
                            );
                        if (propertyClass)
                            client.publish(
                                `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$class`,
                                propertyClass
                            );
                        if (format)
                            client.publish(
                                `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$format`,
                                format
                            );
                        if (settable)
                            client.publish(
                                `${this.getDevicePrefix()}/${nodeId}/${propertyId}/$settable`,
                                settable.toString()
                            );
                    }
                );
            }
        );
        logger("meta", this.meta);

        client.on("message", async (topic, message) => {
            logger("message", topic, message.toString());

            if (this.getDevicePrefix() + "/$config/apiKey/set") {
                this.meta = { apiKey: message.toString() };
                localStorage.setItem(
                    this.deviceId,
                    JSON.stringify(this.meta)
                );
                logger("GOT apiKey -> reconect");

                client.publish(
                    `${this.getDevicePrefix()}/$state`,
                    "paired"
                );
                client.publish(
                    `${this.getDevicePrefix()}/$state`,
                    "disconnected"
                );
                client.end();
                this.connect();
            }
        });
        client.publish(`${this.getDevicePrefix()}/$state`, "ready");
    };

    publishSensorData = (propertyId, value) => {
        const node = this.nodes.find(
            ({ properties, componentType }) =>
                properties.some((prop) => prop.propertyId === propertyId) &&
                componentType === ComponentType.sensor
        );
        if (!node) return logger("unable to locate sensor node");

        this.client.publish(
            `${this.getDevicePrefix()}/${node.nodeId}/${propertyId}`,
            value
        );
    };
    publishData = (nodeId: string, propertyId: string, value: string) => {
        this.client.publish(
            `${this.getDevicePrefix()}/${nodeId}/${propertyId}`,
            value
        );
    };
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
