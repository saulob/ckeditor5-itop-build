import { Plugin } from '@ckeditor/ckeditor5-core';
/**
 * UploadPastedImages Plugin.
 *
 * When an image is copied from a web page ("Copy image"), the clipboard holds both a `text/html` flavor
 * (an `<img>` pointing to the external URL) and the image file itself.
 * By default, CKEditor gives priority to the HTML, so the image stays hosted on the external site.
 *
 * This plugin intercepts such pastes and hands the image file(s) to the existing `uploadImage` command
 * instead. It does not implement any upload logic: the upload adapter is still configured by the integrator.
 * Any other kind of paste (screenshots, text, tables, mixed content, ...) is left to the default pipeline.
 */
export default class UploadPastedImages extends Plugin {
    init(): void;
    static get pluginName(): string;
}
