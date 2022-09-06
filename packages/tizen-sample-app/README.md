# tizen-sample-app

> This is a sample application used by [appium-tizen-tv-driver](../appium-tizen-tv-driver/) for testing

## How to Create This From Scratch

> Note: Version numbers may not be current.

### Install Stuff

1. Install Tizen Studio
2. Run its "Package Manager".
3. On the "Main SDK" tab, install "Web CLI"
4. Click "Extension SDK" tab and expand the "Extras" item in the tree
5. Find "TV Extensions-6.5" and install that.

The installation path of Tizen Studio looks like it's OS-dependent, but by default this is `C:\tizen-studio` on Windows and `/Users/you/tizen-studio` on Mac. IDK about Linux.

Ensure that `TIZEN_STUDIO` is set in your env, and that `$TIZEN_STUDIO/tools/ide/bin` is in your `PATH`.

### A Note About Emulation

TV emulators only seem to work on Windows/Mac _with an Intel CPU_ or Linux with either AMD or Intel (untested). If you have an ARM mac or AMD-based Windows box, you'll need a different box or an actual TV.

### Configure Certificates

> You can probably skip this if deploying to an emulator, or if you have already done this.

You'll need a Samsung Developer account, so go to https://developer.samsung.com and go through their registration song-and-dance.

Open the "Certificate Manager" app, and create a new certificate. You'll need to login here at some point.

When presented with the confusing choice between "Tizen TV" and "Samsung", choose "Samsung". From there, choose "TV".

Click through until you get to the part about "DUIDs" and "Privilege." Choose "Partner" privelege instead of "Public" (the default).

> Note: "Partner" is probably unnecessary for our purposes, but probably can't hurt.

You'll have to put in one or more DUIDs for each device type you plan on deploying to. You can discover the DUID for a device by opening the "Device Manager" app, finding your device, right-clicking and choosing "DUID" from the context menu. There should be a "Copy" button; click that. Close the device manager and/or switch back to the Certificate Manager.

In my case, a DUID field was already populated with the DUID in my clipboard. If you have more of these, enter them. Finally, click "Finish".

Assuming you only have a single certificate pair (author/distributor) you will have a single profile (I think that was the first name you entered); this profile will be the default profile and Tizen Studio will automatically use it.

### Create a Project

Open "Tizen Studio" and create a new project. Choose "Template", "TV", then choose the "Basic template". That should give you this app, roughly.

You can also do this via the `tizen create` command.

### Build & Package

The way I got this to work consistently was to do this:

```bash
tizen build-web
```

This outputs a "built" project to `.buildResult`.

Then you can package the built project with:

```bash
tizen package -s <YOUR_CERTIFICATE_PROFILE> -t wgt -- .buildResult
```

You should see output like:

```text
Author certficate: /somewhere/SamsungCertificate/boneskull/author.p12
Distributor1 certificate : /somewhere/SamsungCertificate/boneskull/distributor.p12
Excludes File Pattern: {.manifest.tmp, .delta.lst}
Ignore File: /path/to/tizen-sample-app/.buildResult/.manifest.tmp
Package File Location: /path/to/tizen-sample-app/.buildResult/sample.wgt
```

### Install

Run:

```bash
tizen install -n sample.wgt -s <HOST>:<PORT>
```

You should see some output like:

```text
Transferring the package...
Transferred the package: /path/to/tizen-sample-app/sample.wgt -> /home/owner/share/tmp/sdk_tools/tmp
Installing the package...
--------------------
Platform log view
--------------------
install SOME_BASE64_STRING.sample
package_path /home/owner/share/tmp/sdk_tools/tmp/sample.wgt
was_install_app return WAS_TRUE
app_id[SOME_BASE64_STRING.sample] install start
app_id[SOME_BASE64_STRING.sample] installing[8]
...
app_id[SOME_BASE64_STRING.sample] installing[100]
app_id[SOME_BASE64_STRING.sample] install completed
spend time for wascmd is [2056]ms
cmd_ret:0
Installed the package: Id(SOME_BASE64_STRING.sample)
Tizen application is successfully installed.
Total time: 00:00:05.461
```

Note that `SOME_BASE64_STRING.sample` is your application ID, and you will need to refer to this when telling Appium to launch it.

You can also use `-t <DEVICE_SERIAL_NO>` instead of `-s <HOST>:<PORT>`.

## License

Copyright © 2022 [HeadSpin](https://headspin.io), Inc. Licensed Apache-2.0
