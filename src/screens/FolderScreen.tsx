import { useState } from "react";
import {
  Folder as FolderIcon,
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  FileText,
  Search,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { api, type NoteFolder, type NoteFile } from "@/lib/api";

interface FolderScreenProps {
  folders: NoteFolder[];
  notes: NoteFile[];
  onRefresh: () => Promise<void>;
  onSelectFolder: (folderId: string) => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function FolderScreen({
  folders,
  notes,
  onRefresh,
  onSelectFolder,
  sidebarCollapsed,
  onToggleSidebar,
}: FolderScreenProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NoteFolder | null>(null);

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const getNotesCount = (folderId: string) => {
    return notes.filter((n) => n.folder_id === folderId).length;
  };

  const handleOpenCreate = () => {
    setEditingFolder(null);
    setFolderName("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (folder: NoteFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setFolderName(folder.name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!folderName.trim()) {
      toast("Folder name cannot be empty", "error");
      return;
    }

    try {
      if (editingFolder) {
        await api.upsertFolder({
          ...editingFolder,
          name: folderName.trim(),
        });
        toast("Folder renamed", "success");
      } else {
        await api.upsertFolder({
          id: "",
          name: folderName.trim(),
          created_at: 0,
          updated_at: 0,
        });
        toast("Folder created", "success");
      }
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      toast(`Failed to save folder: ${err}`, "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteFolder(deleteTarget.id);
      toast(`Folder "${deleteTarget.name}" deleted (notes moved to root)`, "success");
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      toast(`Failed to delete folder: ${err}`, "error");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="flex items-center gap-3 border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-xl shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
          >
            {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search folders…"
            className="h-9.5 pl-10 bg-background/80 rounded-xl"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="rounded-xl h-9 shadow-sm gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Folder</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Stat Bento Row */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Folders
              </span>
              <FolderIcon className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-1.5 text-2xl font-black tracking-tight text-foreground">
              {folders.length}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Organizing your secure documents
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Documents
              </span>
              <FileText className="h-4 w-4 text-sky-500" />
            </div>
            <div className="mt-1.5 text-2xl font-black tracking-tight text-foreground">
              {notes.length}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {notes.filter((n) => !n.folder_id).length} unfiled in root
            </div>
          </div>
        </div>

        {/* Folders Bento Grid */}
        {filteredFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-3">
              <FolderOpen className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No folders found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {search
                ? "Try searching for a different folder name."
                : "Create folders to organize your notes, credentials, and encrypted documents."}
            </p>
            {!search && (
              <Button
                size="sm"
                onClick={handleOpenCreate}
                className="mt-4 rounded-xl gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Folder</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFolders.map((folder) => {
              const count = getNotesCount(folder.id);
              return (
                <div
                  key={folder.id}
                  onClick={() => onSelectFolder(folder.id)}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/80 p-4.5 shadow-sm transition-all duration-200 hover:border-amber-500/40 hover:bg-card hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-105 transition-transform">
                        <FolderIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-foreground group-hover:text-amber-500 transition-colors">
                          {folder.name}
                        </h4>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>
                            {count} {count === 1 ? "document" : "documents"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleOpenEdit(folder, e)}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(folder);
                        }}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                    <span>Click to view files</span>
                    <span className="font-mono">
                      {new Date(folder.updated_at * 1000 || Date.now()).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Rename Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Rename Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Folder Name
            </label>
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Work Documents, Personal Notes"
              className="rounded-xl"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} className="rounded-xl">
              {editingFolder ? "Save" : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Are you sure you want to delete folder{" "}
            <span className="font-bold text-foreground">"{deleteTarget?.name}"</span>?
            <p className="mt-2 text-xs text-amber-500">
              Note: Documents inside this folder will NOT be deleted; they will be moved to root.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-xl">
              Delete Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
