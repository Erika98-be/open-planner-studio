# Choosing the IFC schema

Goal: save your schedule in the IFC schema of the building model you want to merge it with.

## When you need this

The app saves a project as IFC 4.3. If you want to merge the schedule with a building model into one 4D file, for example with the *MergeProjects* recipe of IfcOpenShell (ifcpatch), both files must have the same schema. If the building model is an IFC4 file, IfcOpenShell refuses to merge it with an IFC 4.3 schedule. Then choose the schema of the model here.

## Steps

1. Open *Project info*: *Settings › Project › Project info*, or *File › Project info*.
2. Under *IFC schema when saving*, choose the schema of your building model.
3. Click *Apply*. The project is now *Unsaved*.
4. Save with *Save* (Ctrl+S) or *Save as*.

The three choices:

- *IFC 4.3 (default)* writes `IFC4X3` in the header of the file.
- *IFC 4.3 ADD2* writes `IFC4X3_ADD2`. That is the name of IFC 4.3 in the files that IfcOpenShell creates.
- *IFC4* writes `IFC4`, for a building model in IFC4.

## Pitfalls and what the app does

**The content of the file does not change.** The three schemas know the scheduling data that the app writes in the same way. Only the `FILE_SCHEMA` line in the header differs. So you lose nothing when you choose another schema.

**An IFC 4.3 model from IfcOpenShell or Bonsai** usually has `IFC4X3_ADD2` in the header. IfcOpenShell does not merge a schedule with `IFC4X3` into it. Then choose *IFC 4.3 ADD2*. If in doubt, look at the `FILE_SCHEMA` line at the top of the model file.

**The choice belongs to the project.** It is stored in the file itself. If you open an IFC4 file, the app saves it as IFC4 again. A new project starts at *IFC 4.3 (default)*.

**A file in another schema**, such as IFC2X3, opens in the app. When you save, the app writes it as IFC 4.3.

**Undo reverts the choice**, like any other change in *Project info*.

**Auto-save and crash recovery use the same schema** as *Save*.

## See also

- [New project and Project info](docs://ref-projectinfo): all fields of the form.
- [Files and formats](docs://uitleg-bestanden): why IFC is the app's own format.
- [Opening and saving a file](docs://howto-bestand-openen-en-opslaan): save and save as.
