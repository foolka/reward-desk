#include <QApplication>
#include <QDir>
#include "dock.hpp"
int main(int argc, char **argv) {
    QApplication app(argc, argv);
    const auto profile = qEnvironmentVariable("REWARD_DESK_OBS_TEST_PROFILE");
    if (profile.isEmpty() || !QDir::isAbsolutePath(profile)) return 2;
    RewardDock dock(profile, {}, true);
    dock.resize(320, 540); dock.setWindowTitle("Reward Desk OBS - isolated preview"); dock.show();
    const auto screenshot = qEnvironmentVariable("REWARD_DESK_OBS_SCREENSHOT");
    if (!screenshot.isEmpty()) QTimer::singleShot(3500, &app, [&] { dock.grab().save(screenshot); app.quit(); });
    return app.exec();
}
