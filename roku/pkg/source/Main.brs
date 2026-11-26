sub Main()
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)
    scene = screen.CreateScene("MoonfinScene")
    screen.show()
    scene.findNode("app").observeField("exitApp", m.port)
    while true
        msg = wait(0, m.port)
        if type(msg) = "roSGScreenEvent" and msg.isScreenClosed() then return
        if type(msg) = "roSGNodeEvent" and msg.getField() = "exitApp" then return
    end while
end sub
