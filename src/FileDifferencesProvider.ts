import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const excludedDirs = ['node_modules', '.git'];

class FileGroupFile {
    constructor(
        public readonly filePath: string,
        public readonly relFilePath: string,
        public readonly timestampModified: number
    ) {
    }
}

class FileGroup {
    #files: FileGroupFile[]  = [];
    #subgroups: FileGroup[] = [];
    constructor(
        public readonly fileName: string
    ) {}
    addFile(f: FileGroupFile) {
        this.#files.push(f);
    }
    numFiles() {
        return this.#files.length;
    }
    file(i: number) {
        return this.#files[i];
    }
    numSubgroups() {
        return this.#subgroups.length;
    }
    subgroup(i: number) {
        return this.#subgroups[i];
    }
    splitIntoSubgroups() {
        this.#subgroups = [];
        if  (this.#files.length === 1) {
            const g = new FileGroup(this.fileName);
            g.addFile(g.file(0));
            this.#subgroups = [g];
            return;
        }
        const contents: string[] = [];
        for (let i = 0; i < this.#files.length; i++) {
            const c = fs.readFileSync(this.#files[i].filePath, 'utf-8');
            contents.push(c);
        }
        const subgroupIds: number[] = [];
        let lastSubgroupId = -1;
        for (let i = 0; i < this.#files.length; i++) {
            let id: number | undefined = undefined;
            for (let j = 0; j < i; j++) {
                if (contents[i] === contents[j]) {
                    id = subgroupIds[j];
                    break;
                }
            }
            if (id === undefined) {
                lastSubgroupId ++;
                id = lastSubgroupId;
            }
            subgroupIds.push(id as number);
        }
        const numSubgroups = lastSubgroupId + 1;
        for (let id = 0; id < numSubgroups; id++) {
            const sg = new FileGroup(this.fileName);
            for (let i = 0; i < this.#files.length; i++) {
                if (subgroupIds[i] === id) {
                    sg.addFile(this.#files[i]);
                }
            }
            this.#subgroups.push(sg);
        }
    }
}

type TreeItem = FileItem | FileGroupItem;

export class FileDifferencesProvider implements vscode.TreeDataProvider<TreeItem> {
    constructor(private workspaceRoot: string) { }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No dependency in empty workspace');
            return Promise.resolve([]);
        }

        if (element) {
            if (element instanceof FileGroupItem) {
                const g = element.fileGroup;
                const list: {fileGroupFile: FileGroupFile, id: number}[] = [];
                for (let id = 0; id < g.numSubgroups(); id++) {
                    const sg = g.subgroup(id);
                    for (let i = 0; i < sg.numFiles(); i++) {
                        list.push({fileGroupFile: sg.file(i), id});
                    }
                }
                list.sort((a, b) => (b.fileGroupFile.timestampModified - a.fileGroupFile.timestampModified));
                const items: FileItem[] = [];
                for (let x of list) {
                    items.push(new FileItem(x.fileGroupFile, x.id, list[0].fileGroupFile));
                }
                return Promise.resolve(items);
            }
            else {
                return Promise.resolve([]);
            }
        } else {
            const ignoreFileNames = this._parseIgnoreFileNames();
            const fileGroups: {[fname: string]: FileGroup} = {};
            function scanDir(dirPath: string, relDirPath: string) {
                const x = fs.readdirSync(dirPath);
                for (let fname of x) {
                    if (!ignoreFileNames.includes(fname)) {
                        const filePath = path.join(dirPath, fname);
                        const relFilePath = path.join(relDirPath, fname);
                        if (!fs.lstatSync(filePath).isDirectory()) {
                            if ((fname.endsWith('.ts')) || (fname.endsWith('.tsx'))) {
                                if (!fileGroups[fname]) {
                                    fileGroups[fname] = new FileGroup(fname);
                                }
                                const timestampModified = fs.statSync(filePath).mtime.getTime();
                                fileGroups[fname].addFile(new FileGroupFile(filePath, relFilePath, timestampModified));
                            }
                        }
                    }
                }
                for (let fname of x) {
                    const filePath = path.join(dirPath, fname);
                    const relFilePath = path.join(relDirPath, fname);
                    if (!excludedDirs.includes(fname)) {
                        if (fs.lstatSync(filePath).isDirectory()) {
                            scanDir(filePath, relFilePath);
                        }
                    }
                }
            }
            scanDir(this.workspaceRoot, '');
            const items: FileGroupItem[] = [];
            const groupFileNames = Object.keys(fileGroups).sort();
            for (let f of groupFileNames) {
                const g = fileGroups[f];
                if (g.numFiles() > 1) {
                    g.splitIntoSubgroups();
                    if (g.numSubgroups() > 1) {
                        items.push(new FileGroupItem(g));
                    }
                }
            }
            if (items.length > 0) {
                return Promise.resolve(items);
            }
            else {
                // vscode.window.showInformationMessage("No file differences found.");
                return Promise.resolve([]);
            }
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _parseIgnoreFileNames(): string[] {
        const fname = path.join(this.workspaceRoot, '.sync-ts-ignore');
        if (!fs.existsSync(fname)) {
            return [];
        }
        const x = fs.readFileSync(fname, 'utf-8');
        return x.split('\n');
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

export class FileGroupItem extends vscode.TreeItem {
    constructor(
        public readonly fileGroup: FileGroup
    ) {
        const label = fileGroup.fileName;
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'FileGroupItem';
        // this.tooltip = filePath;
        // this.description = filePath;
    }
}

export class FileItem extends vscode.TreeItem {
    constructor(
        public readonly file: FileGroupFile,
        public readonly version: number,
        public readonly diffFile: FileGroupFile
    ) {
        const label = `v${version} ${file.relFilePath}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        // this.tooltip = file;
        // this.description = filePath;

        this.contextValue = file.filePath !== diffFile.filePath ? 'FileItem' : 'FileItemReference';

        this.command = file.filePath !== diffFile.filePath ? (
            {
                title: 'diff',
                command: 'vscode.diff',
                arguments: [vscode.Uri.file(diffFile.filePath), vscode.Uri.file(file.filePath), `Diff with most recent ${path.basename(file.filePath)}`],
                tooltip: 'Compare this file with the most recent from this group'
            }
        ) : (
            {
                title: 'open',
                command: 'vscode.open',
                arguments: [vscode.Uri.file(file.filePath)],
                tooltip: 'Open this file'
            }
        );
    }
}
