import { Plugin, type Command } from '@ckeditor/ckeditor5-core';
import type { ViewDocumentClipboardInputEvent } from '@ckeditor/ckeditor5-clipboard';
import type { ModelWriter } from '@ckeditor/ckeditor5-engine';

/**
 * Elements that carry content which would be lost if the pasted HTML was replaced by an image upload.
 */
const SIGNIFICANT_ELEMENTS_SELECTOR = 'table, hr, video, audio, iframe, embed, object, svg, canvas';

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
    init() {
        const editor = this.editor;

        // 'high' runs before the default handlers (ImageUploadEditing and the clipboard pipeline, both 'normal')
        // but after the "pasting is disabled in non-editable places" check of the clipboard pipeline ('highest').
        this.listenTo<ViewDocumentClipboardInputEvent>(editor.editing.view.document, 'clipboardInput', (evt, data) => {
            // Drag and drop is not handled here.
            if (data.method !== 'paste') {
                return;
            }

            // Without HTML (screenshots, Print Screen, ...), the default image upload already does the job.
            const sHtml = data.dataTransfer.getData('text/html');
            if (!sHtml) {
                return;
            }

            const aImageTypes = editor.config.get('image.upload.types');
            if (!Array.isArray(aImageTypes)) {
                return;
            }

            const oUploadImageCommand = editor.commands.get('uploadImage') as (Command & { isAccessAllowed?: boolean }) | undefined;
            if (!oUploadImageCommand || !oUploadImageCommand.isEnabled) {
                return;
            }

            // The upload adapter is set by the integrator (possibly after the editor creation) and not for every editor.
            // Without it, no image would be inserted, so keep the default behavior instead of losing the pasted content.
            const oFileRepository = editor.plugins.has('FileRepository') ? editor.plugins.get('FileRepository') : null;
            if (!oFileRepository || !oFileRepository.createUploadAdapter) {
                return;
            }

            const oImageTypesRegExp = createImageTypeRegExp(aImageTypes);
            const aFiles = Array.from(data.dataTransfer.files).filter(oFile => oFile && oImageTypesRegExp.test(oFile.type));
            if (aFiles.length === 0) {
                return;
            }

            if (!isImageOnlyHtml(sHtml, aFiles.length)) {
                return;
            }

            evt.stop();

            editor.model.change((writer: ModelWriter) => {
                // Set selection to paste target (same as the default image upload handler).
                if (data.targetRanges) {
                    writer.setSelection(data.targetRanges.map(oViewRange => editor.editing.mapper.toModelRange(oViewRange)));
                }

                editor.execute('uploadImage', { file: aFiles });
            });

            // Same as the default image upload handler: the command is executed anyway, then the user is warned.
            if (oUploadImageCommand.isAccessAllowed === false) {
                editor.plugins.get('Notification').showWarning(editor.locale.t('You have no image upload permissions.'), {
                    namespace: 'image'
                });
            }
        }, { priority: 'high' });
    }

    static get pluginName() {
        return 'UploadPastedImages';
    }
}

/**
 * Builds a RegExp matching the MIME types allowed for the image upload (e.g. ['png', 'svg+xml'] => /^image\/(png|svg\+xml)$/).
 * Types may contain regular expression special characters ("+", ".", ...), so they must be escaped.
 */
function createImageTypeRegExp(aTypes: unknown[]): RegExp {
    const aSafeNames = aTypes
        .filter((type): type is string => typeof type === 'string' && type !== '')
        .map(sType => sType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // An empty alternation would match "image/", so make sure nothing matches when there is no valid type.
    if (aSafeNames.length === 0) {
        return /(?!)/;
    }

    return new RegExp(`^image\\/(${aSafeNames.join('|')})$`);
}

/**
 * Tells whether the HTML only represents the image(s) that come with the clipboard files:
 * no more images than files, no text and no other meaningful content.
 */
function isImageOnlyHtml(sHtml: string, iFilesCount: number): boolean {
    const oDocument = new DOMParser().parseFromString(sHtml, 'text/html');

    // More images than files: some of them could not be uploaded, keep the default behavior.
    const iImagesCount = oDocument.body.querySelectorAll('img').length;
    if (iImagesCount === 0 || iImagesCount > iFilesCount) {
        return false;
    }

    oDocument.body.querySelectorAll('img, picture, source').forEach(oElement => oElement.remove());

    if (oDocument.body.querySelector(SIGNIFICANT_ELEMENTS_SELECTOR) !== null) {
        return false;
    }

    return (oDocument.body.textContent ?? '').trim() === '';
}
