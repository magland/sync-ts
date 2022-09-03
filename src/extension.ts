// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FileDifferencesProvider, FileGroupItem, FileItem } from './FileDifferencesProvider';
import * as fs from 'fs';
import * as path from 'path';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	console.info(`Root path: ${rootPath}`);

	if (!rootPath) {
		console.warn('No root path');
		return;
	}

	const outputChannel = vscode.window.createOutputChannel('File Differences');
	outputChannel.appendLine(`Root path: ${rootPath}`);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Extension "sync-ts" is active');

	// example of custom command handler
	// const diffHandler = (a1: string, a2: string, a3: string) => {
	// 	console.log('---- test diff', a1, a2, a3);
	// 	vscode.commands.executeCommand('vscode.diff', a1, a2, a3);
	// };
	// context.subscriptions.push(vscode.commands.registerCommand('custom.diff', diffHandler));

	vscode.commands.registerCommand('fileDifferences.refreshEntry', () => {
		fileDifferencesProvider.refresh();
	});

	vscode.commands.registerCommand('fileDifferences.openFile', (item: FileItem) => {
		vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.file.filePath));
	});

	vscode.commands.registerCommand('fileDifferences.compareWithReference', (item: FileItem) => {
		vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(item.diffFile.filePath), vscode.Uri.file(item.file.filePath), `Diff with most recent ${path.basename(item.file.filePath)}`);
	});
	
	vscode.commands.registerCommand('fileDifferences.addToIgnore', (item: FileGroupItem) => {
		const fname = path.join(rootPath, '.sync-ts-ignore');
		const txt = fs.existsSync(fname) ? fs.readFileSync(fname, 'utf-8') : '';
		const txtNew = [...txt.split('\n'), item.fileGroup.fileName].join('\n');
		fs.writeFileSync(fname, txtNew);
		fileDifferencesProvider.refresh();
	});

	const fileDifferencesProvider = new FileDifferencesProvider(rootPath);
	vscode.window.registerTreeDataProvider('fileDifferences', fileDifferencesProvider);
}

// this method is called when your extension is deactivated
export function deactivate() {}
