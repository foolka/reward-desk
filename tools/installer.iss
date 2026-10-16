#ifndef AppVersion
  #error AppVersion is required
#endif
[Setup]
AppId={{C65EBA28-42E6-4D4C-A350-E4080559F1B2}
AppName=Reward Desk
AppVersion={#AppVersion}
AppPublisher=FermionaPlay
AppPublisherURL=https://github.com/foolka/reward-desk
DefaultDirName={localappdata}\Programs\Reward Desk
DefaultGroupName=Reward Desk
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
WizardStyle=modern
SetupIconFile={#PackageDir}\resources\app.ico
UninstallDisplayIcon={app}\RewardDesk.exe
OutputDir={#OutputDir}
OutputBaseFilename=reward-desk-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
CloseApplications=no
RestartApplications=no
[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "uk"; MessagesFile: "compiler:Languages\Ukrainian.isl"
[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"
[Files]
Source: "{#PackageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\Reward Desk"; Filename: "{app}\RewardDesk.exe"
Name: "{autodesktop}\Reward Desk"; Filename: "{app}\RewardDesk.exe"; Tasks: desktopicon
[Code]
function ProcessGuard(): String;
var Locator, Services, Items: Variant;
begin
  Result := '';
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Locator.ConnectServer('.', 'root\CIMV2');
    Items := Services.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''RewardDesk.exe''');
    if Items.Count > 0 then Result := 'Закройте Reward Desk через «Выход» в трее. Данные не изменены.';
  except
    Result := 'Не удалось проверить запущенные приложения. Установка отменена.';
  end;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := ProcessGuard();
end;
function InitializeUninstall(): Boolean;
var Reason: String;
begin
  Reason := ProcessGuard(); Result := Reason = '';
  if not Result then MsgBox(Reason, mbError, MB_OK);
end;
