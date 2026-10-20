# Giving feedback

Goal: report an error or pass on an idea, optionally with a screenshot, directly from the app.

## When you need this

The schedule calculates something you do not understand, a button does not do what it should, or you miss something in the app. A good report helps the makers find the problem. That is why the app itself puts the version, the operating system and the language in your report. What you describe yourself decides whether they can do something with it: what you did, what you expected and what happened.

## Steps

1. Click the button *Give feedback* at the top of the window. That button is always in the title bar. Its text changes every ten minutes: *Give feedback*, *Report a bug* and *Add a new feature*. It is always the same button. The window *Send feedback* opens.
2. Choose *Bug* for something that does not work as it should, or *Feature request* for an idea. *Bug* is selected by default.
3. Fill in the *Title* and then the *Description*, for example: which task you changed, what you expected and what you saw. Without a title, or with fewer than 10 characters together, the button *Send* is grey. A short line under the form then says what is missing.
4. If you want a reply, fill in your *Email address*. That field is optional. The app remembers the address after a successful report, so it is already there next time.
5. If you want to show something, turn on *Attach screenshot*. The app then makes a picture of the app without this window. A moment later you see a small preview. With *Annotate* an editor opens in which you put arrows, rectangles, freehand lines and text on the picture. There you choose the color, take back your last action with *Undo* or start over with *Clear all*. Click *Done* when you are satisfied.
6. Click *Send*. While sending, the button says *Sending…*.
7. You see *Thank you, your report has been sent.* If an issue on GitHub was made for your report, there is also the button *View on GitHub*. Click *Close*.

## Where your report goes

The app sends your report to Open Feedback Studio by OpenAEC. You do not need an account for that, also not on GitHub. The makers see your report in their overview. If the app is linked to GitHub there, Open Feedback Studio also turns it into a public issue on GitHub, with the label *bug* or *enhancement*. Under your description there is then a line with the version of Open Planner Studio, your operating system and the language of the app.

## Pitfalls and what the app does then

**Your report can become public.** Do not put anything in it that you do not want to share. That also goes for the screenshot: the picture shows everything that is visible in the app at that moment, such as task names and resources of your project. The app makes the screenshot at the moment you turn on *Attach screenshot*. So make sure the screen is right before you do that, and leave out what you do not want to show.

**The screenshot is too large.** The app makes the screenshot smaller before sending. If it is still too large after that, your report goes without a picture. The thank-you screen then says *The screenshot was too large and was not sent.*

**Sending does not work.** A message appears in the window and your text stays. There are four cases:

- *The report was not accepted.* Check the text and the email address. A report that is mostly links is refused.
- *You have sent many reports in a short time.* Try again in an hour.
- *This report was already sent in the last 24 hours.* The same report then does not come in a second time.
- *Sending failed.* There is no connection or the server does not answer. Try again, or click *Open on GitHub*.

**Open on GitHub.** This is the route without Open Feedback Studio. For this you do need an account on GitHub. Without a screenshot the GitHub page on which you create a new issue opens straight away in your browser, with your title and description already filled in. With a screenshot you first see *Almost done — your screenshot is on the clipboard.* with four steps. Click *OK, go to GitHub*, click inside the large text area of the issue page and press Ctrl+V (Cmd+V on a Mac). Then click *Submit new issue* at the bottom. Only then is your report sent.

**Pasting does not work.** On the GitHub route the screenshot is also saved as a file on your computer. In the desktop app the window mentions the path: *Can't paste? We also saved the screenshot to* that path *— drag that file into the text area.* In the browser the app downloads the picture as `feedback-` with a number and the extension `.png`. You find it in your downloads folder and drag it into the text area.

**The screenshot fails.** It says *Screenshot capture failed. You can still send feedback without a screenshot.* The checkbox goes off and you can send your report without a picture.

**You have typed a lot and click beside the window by accident.** That does not close the window, so your text stays. Esc or *Cancel* does close it, and then your text is gone. While sending, Esc does not close the window.

## See also

- [Updating the app](docs://howto-app-bijwerken): before a report, check whether you have the latest version.
