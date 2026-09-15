import type { Controller, Http } from "xpresser/types/http";
import type { ObjectId } from "xpress-mongo";
import Device, { DeviceDataType } from "../../models/Device";
import { deviceLimitFor, resolveDeviceFolder } from "../../lib/Devices";

/**
 * DeviceController
 * Devices are api keys used by external apps through the legacy api at `/api/legacy/*`.
 * The key is shown once, when the device is created or its key is rotated.
 */
export = <Controller.Object<{ authId: ObjectId; device: Device }>>{
    // Controller Name
    name: "Client/DeviceController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        // Use Abolish to validate all request body.
        Abolish: ["create", "rename", "setFolder"]
    },

    /**
     * @openapi
     * /client/v1/devices:
     *   get:
     *     tags: [Devices]
     *     summary: List devices
     *     description: |
     *       Every device of the user, newest first, with how many of the plan's devices are used.
     *       Api keys are never returned, only the last characters of each key (`keyHint`).
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Devices.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/DeviceListResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *   post:
     *     tags: [Devices]
     *     summary: Create a device
     *     description: |
     *       Creates a device and returns its api key. The key is shown **once**: only its hash is
     *       stored, so a lost key has to be rotated. Free accounts may have 3 devices, Pro unlimited.
     *       The device reads and writes clips in one folder, `clipboard` by default. Encrypted
     *       folders are refused.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/CreateDeviceBody" }
     *           example: { name: My Laptop, folder: clipboard }
     *     responses:
     *       200:
     *         description: Device created, with its api key.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/CreateDeviceResponse" }
     *       400:
     *         description: Validation error or encrypted folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       403:
     *         description: Device limit of the plan reached.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * List the user's devices.
     */
    async all(http, { authId: userId }) {
        const devices = Device.fromArray(
            await Device.find<DeviceDataType>({ userId }, { sort: { createdAt: -1 } })
        );

        const max = deviceLimitFor(http.authData().plan);

        return {
            devices: devices.map((d) => d.summary()),
            limit: { max, used: devices.length }
        };
    },

    /**
     * Create a device. The api key is returned once and never again.
     */
    async create(http, { authId: userId }) {
        const { name, folder } = http.validatedBody<{ name: string; folder: string }>();

        const max = deviceLimitFor(http.authData().plan);

        if (max !== null) {
            const used = await Device.count({ userId });

            if (used >= max) {
                return http.error(
                    `Your plan allows ${max} device(s). Upgrade to Pro for unlimited devices.`,
                    403,
                    { limit: max, used }
                );
            }
        }

        const target = await resolveDeviceFolder(userId, folder);
        if ("error" in target) return http.badRequestError(target.error);

        const apiKey = Device.generateApiKey();
        const device = Device.make(<DeviceDataType>{
            userId,
            name,
            folder: target.folder.data.slug
        }).setApiKey(apiKey) as Device;

        await device.save();

        return {
            device: device.summary(),
            apiKey,
            message: "Device created. Copy the api key now, it will not be shown again."
        };
    },

    /**
     * @openapi
     * /client/v1/device/{device}/rename:
     *   post:
     *     tags: [Devices]
     *     summary: Rename a device
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: device, required: true, schema: { type: string }, description: Device publicId. }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/RenameDeviceBody" }
     *           example: { name: Work Laptop }
     *     responses:
     *       200:
     *         description: Renamed.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/DeviceResponse" }
     *       404:
     *         description: Device not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async rename(http, { device }) {
        const { name } = http.validatedBody<{ name: string }>();

        device.data.name = name;
        await device.save();

        return { device: device.summary(), message: "Device renamed." };
    },

    /**
     * @openapi
     * /client/v1/device/{device}/folder:
     *   post:
     *     tags: [Devices]
     *     summary: Change the device folder
     *     description: |
     *       Sets the folder the device reads from and writes to through the legacy api.
     *       Encrypted folders are refused. Clips already created stay where they are.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: device, required: true, schema: { type: string }, description: Device publicId. }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/SetDeviceFolderBody" }
     *           example: { folder: work }
     *     responses:
     *       200:
     *         description: Folder changed.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/DeviceResponse" }
     *       400:
     *         description: Unknown or encrypted folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: Device not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async setFolder(http, { device, authId: userId }) {
        const { folder } = http.validatedBody<{ folder: string }>();

        const target = await resolveDeviceFolder(userId, folder);
        if ("error" in target) return http.badRequestError(target.error);

        device.data.folder = target.folder.data.slug;
        await device.save();

        return {
            device: device.summary(),
            message: `Device now uses folder '${target.folder.data.name}'.`
        };
    },

    /**
     * @openapi
     * /client/v1/device/{device}/rotate-key:
     *   post:
     *     tags: [Devices]
     *     summary: Rotate the api key
     *     description: |
     *       Replaces the device's api key and returns the new one **once**. The old key stops
     *       working immediately, and the app has to call the legacy `connect` endpoint again.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: device, required: true, schema: { type: string }, description: Device publicId. }
     *     responses:
     *       200:
     *         description: New api key.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/CreateDeviceResponse" }
     *       404:
     *         description: Device not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async rotateKey(http, { device }) {
        const apiKey = Device.generateApiKey();

        device.setApiKey(apiKey);
        await device.save();

        // The new key has never been connected, so the app has to connect it again.
        if (device.data.connectedAt || device.data.usedBy) {
            await device.unset(["connectedAt", "usedBy"]);
        }

        return {
            device: device.summary(),
            apiKey,
            message: "Api key rotated. The old key no longer works."
        };
    },

    /**
     * @openapi
     * /client/v1/device/{device}/enable:
     *   post:
     *     tags: [Devices]
     *     summary: Enable a device
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: device, required: true, schema: { type: string }, description: Device publicId. }
     *     responses:
     *       200:
     *         description: Enabled.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/DeviceResponse" }
     *       404:
     *         description: Device not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     * /client/v1/device/{device}/disable:
     *   post:
     *     tags: [Devices]
     *     summary: Disable a device
     *     description: A disabled key is refused by the legacy api exactly like an unknown one.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: device, required: true, schema: { type: string }, description: Device publicId. }
     *     responses:
     *       200:
     *         description: Disabled.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/DeviceResponse" }
     *       404:
     *         description: Device not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async enable(http, { device }) {
        device.data.enabled = true;
        await device.save();

        return { device: device.summary(), message: "Device enabled." };
    },

    async disable(http, { device }) {
        device.data.enabled = false;
        await device.save();

        return { device: device.summary(), message: "Device disabled." };
    },

    /**
     * @openapi
     * /client/v1/device/{device}:
     *   delete:
     *     tags: [Devices]
     *     summary: Delete a device
     *     description: The api key stops working. Clips the device created stay.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: device, required: true, schema: { type: string }, description: Device publicId. }
     *     responses:
     *       200:
     *         description: Deleted.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       404:
     *         description: Device not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async delete(http, { device }) {
        const name = device.data.name;
        await device.delete();

        return { message: `Device: ${name}, deleted successfully.` };
    }
};
