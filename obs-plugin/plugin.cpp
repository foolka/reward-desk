#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <QPointer>
#include <QStandardPaths>
#include <QDir>
#include "dock.hpp"

struct obs_module;
static obs_module *module = nullptr;
static QPointer<RewardDock> dock;
static bool registered = false;
template<typename T> static T api(const char *name) {
    auto handle = GetModuleHandleW(L"obs-frontend-api.dll");
    return handle ? reinterpret_cast<T>(GetProcAddress(handle, name)) : nullptr;
}
extern "C" __declspec(dllexport) void obs_module_set_pointer(obs_module *pointer) { module = pointer; }
extern "C" __declspec(dllexport) uint32_t obs_module_ver(void) { return 32u << 24; }
extern "C" __declspec(dllexport) const char *obs_module_name(void) { return "Reward Desk OBS"; }
extern "C" __declspec(dllexport) const char *obs_module_author(void) { return "FermionaPlay"; }
extern "C" __declspec(dllexport) const char *obs_module_description(void) { return "Local reward controls and browser editor using the shared Reward Desk profile."; }
extern "C" __declspec(dllexport) bool obs_module_load(void) {
    return api<bool(*)(const char*, const char*, void*)>("obs_frontend_add_dock_by_id") != nullptr;
}
extern "C" __declspec(dllexport) void obs_module_post_load(void) {
    if (dock) return;
    auto add = api<bool(*)(const char*, const char*, void*)>("obs_frontend_add_dock_by_id");
    const auto handle = GetModuleHandleW(L"obs.dll");
    const auto data = handle ? reinterpret_cast<const char*(*)(obs_module*)>(GetProcAddress(handle, "obs_get_module_data_path")) : nullptr;
    if (!add || !data || !module || !data(module)) return;
    dock = new RewardDock(QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation) + "/RewardDeskOBS",
        QDir(QString::fromUtf8(data(module))).filePath("runtime"));
    registered = add("reward-desk-obs", "Reward Desk", dock.data());
    if (!registered) { delete dock.data(); dock = nullptr; }
}
extern "C" __declspec(dllexport) void obs_module_unload(void) {
    auto remove = api<void(*)(const char*)>("obs_frontend_remove_dock");
    if (dock && registered && remove) remove("reward-desk-obs");
    else delete dock.data();
    dock = nullptr; registered = false;
}
